import { createHmac, timingSafeEqual } from 'node:crypto';

const HIGH_INTENT = new Set(['RFQ','QUOTE_REQUEST','CONTACT_REQUEST','SAMPLE_REQUEST']);

function normalizeHeaders(headers={}) {
  return Object.fromEntries(Object.entries(headers).map(([key,value])=>[String(key).toLowerCase(),String(value)]));
}

export function verifyWebhookSignature({ rawBody, signature, secret, algorithm='sha256' }={}) {
  if (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody)) throw new TypeError('rawBody is required');
  if (!signature || !secret) throw new TypeError('signature and secret are required');
  const expected=createHmac(algorithm,secret).update(rawBody).digest('hex');
  const supplied=String(signature).replace(/^sha256=/i,'').trim().toLowerCase();
  if (supplied.length!==expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied,'utf8'),Buffer.from(expected,'utf8'));
}

export function createWebsiteConversionAdapter({ id='website-conversion-v1', domain, secretProvider, clock=()=>new Date().toISOString(), maxBodyBytes=256*1024 }={}) {
  if (!domain) throw new TypeError('domain is required');
  if (typeof secretProvider!=='function') throw new TypeError('secretProvider is required');
  const replay=new Set();

  async function ingestWebhook({ rawBody, headers={} }={}) {
    const bodyBuffer=Buffer.isBuffer(rawBody)?rawBody:Buffer.from(String(rawBody??''),'utf8');
    if (!bodyBuffer.length) throw new TypeError('rawBody is required');
    if (bodyBuffer.length>maxBodyBytes) throw new Error('WEBSITE_WEBHOOK_BODY_TOO_LARGE');
    const h=normalizeHeaders(headers);
    const eventId=h['x-growth-event-id'];
    const signature=h['x-growth-signature'];
    if (!eventId) throw new Error('WEBSITE_WEBHOOK_EVENT_ID_REQUIRED');
    if (replay.has(eventId)) return { status:'DUPLICATE', eventId };
    const secret=await secretProvider({domain});
    if (!secret) throw new Error('WEBSITE_WEBHOOK_SECRET_UNAVAILABLE');
    if (!verifyWebhookSignature({rawBody:bodyBuffer,signature,secret})) throw new Error('WEBSITE_WEBHOOK_SIGNATURE_INVALID');
    let payload;
    try { payload=JSON.parse(bodyBuffer.toString('utf8')); } catch { throw new Error('WEBSITE_WEBHOOK_JSON_INVALID'); }
    const eventType=String(payload.eventType??'').toUpperCase();
    if (!eventType) throw new Error('WEBSITE_WEBHOOK_EVENT_TYPE_REQUIRED');
    const contact=payload.contact??{};
    const normalized=Object.freeze({
      eventId,
      source:'WEBSITE',
      sourceDomain:domain,
      externalId:payload.externalId??eventId,
      kind:eventType,
      highIntent:HIGH_INTENT.has(eventType),
      email:contact.email??null,
      phone:contact.phone??null,
      person:Object.freeze({name:contact.name??null,role:contact.role??null}),
      company:Object.freeze({name:contact.company??null,website:contact.companyWebsite??null}),
      market:payload.market??null,
      productRefs:Object.freeze([...(payload.productRefs??[])]),
      message:payload.message??null,
      consent:Object.freeze({marketing:Boolean(payload.consent?.marketing),optOut:Boolean(payload.consent?.optOut)}),
      provenance:Object.freeze({eventId,sourceDomain:domain,receivedAt:clock()}),
      rawRef:payload.rawRef??null,
    });
    replay.add(eventId);
    return { status:'ACCEPTED', event:normalized };
  }

  return Object.freeze({
    id,
    channel:'WEBSITE',
    transport:'SIGNED_WEBHOOK',
    capabilities:Object.freeze(['RECEIVE_WEBHOOK','READ_ENGAGEMENT']),
    riskLevel:'LOW',
    requiresApproval:false,
    ingestWebhook,
    getReplaySize:()=>replay.size,
  });
}
