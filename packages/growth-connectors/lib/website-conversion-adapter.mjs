import { createHmac, timingSafeEqual } from 'node:crypto';

const HIGH_INTENT = new Set(['RFQ','QUOTE_REQUEST','CONTACT_REQUEST','SAMPLE_REQUEST']);
const EVENT_TYPES=new Set([...HIGH_INTENT,'DEMO_REQUEST','FORM_SUBMISSION','CONTENT_DOWNLOAD','PAGE_VIEW','OPT_OUT']);
const safeText=(value,label,max,{optional=false,multiline=false}={})=>{if(optional&&(value==null||value===''))return null;if(typeof value!=='string')throw new Error(`WEBSITE_WEBHOOK_${label}_INVALID`);const text=value.trim(),controls=multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/;if(!text||text.length>max||controls.test(text))throw new Error(`WEBSITE_WEBHOOK_${label}_INVALID`);return text;};
const safeReference=(value,label,{optional=false}={})=>{const text=safeText(value,label,160,{optional});if(text===null)return null;if(!/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$/.test(text)||/(?:^sk-|^gh[pousr]_|bearer\s|password\s*=|token\s*=|api[_-]?key\s*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/i.test(text))throw new Error(`WEBSITE_WEBHOOK_${label}_INVALID`);return text;};

function normalizeHeaders(headers={}) {
  if(!headers||typeof headers!=='object')throw new Error('WEBSITE_WEBHOOK_HEADERS_INVALID');
  const entries=typeof headers?.entries==='function'?[...headers.entries()]:Object.entries(headers);
  if(entries.length>64)throw new Error('WEBSITE_WEBHOOK_HEADERS_TOO_LARGE');
  const normalized=Object.create(null);
  for(const [rawKey,rawValue] of entries){const key=String(rawKey).toLowerCase(),value=rawValue;if(!/^[a-z0-9-]{1,64}$/.test(key)||typeof value!=='string'||Buffer.byteLength(value)>8192||/[\u0000\r\n]/.test(value))throw new Error('WEBSITE_WEBHOOK_HEADER_INVALID');normalized[key]=value;}
  return normalized;
}

export function verifyWebhookSignature({ rawBody, signature, secret, eventId, timestamp, algorithm='sha256' }={}) {
  if (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody)) throw new TypeError('rawBody is required');
  if (!signature || !secret || !eventId || !timestamp) throw new TypeError('signature, secret, eventId and timestamp are required');
  const expected=createHmac(algorithm,secret).update(`${timestamp}.${eventId}.`).update(rawBody).digest('hex');
  const supplied=String(signature).replace(/^sha256=/i,'').trim().toLowerCase();
  if (supplied.length!==expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied,'utf8'),Buffer.from(expected,'utf8'));
}

export function createWebsiteConversionAdapter({ id='website-conversion-v1', domain, secretProvider, clock=()=>new Date().toISOString(), maxBodyBytes=256*1024, maxClockSkewSeconds=300, maxReplayEntries=10000,secretResolutionTimeoutMs=1000 }={}) {
  if (typeof domain!=='string'||!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)) throw new TypeError('valid domain is required');
  if (typeof secretProvider!=='function') throw new TypeError('secretProvider is required');
  if(!Number.isInteger(maxBodyBytes)||maxBodyBytes<1||maxBodyBytes>1024*1024)throw new TypeError('maxBodyBytes must be between 1 and 1048576');
  if(!Number.isFinite(maxClockSkewSeconds)||maxClockSkewSeconds<1||maxClockSkewSeconds>900)throw new TypeError('maxClockSkewSeconds must be between 1 and 900');
  if(!Number.isInteger(maxReplayEntries)||maxReplayEntries<1||maxReplayEntries>100000)throw new TypeError('maxReplayEntries must be between 1 and 100000');
  if(!Number.isInteger(secretResolutionTimeoutMs)||secretResolutionTimeoutMs<100||secretResolutionTimeoutMs>5000)throw new TypeError('secretResolutionTimeoutMs must be between 100 and 5000');
  const replay=new Set();
  const resolveSecret=async()=>{const controller=new AbortController();let timer;try{const secret=await Promise.race([Promise.resolve().then(()=>secretProvider({domain,signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('WEBSITE_WEBHOOK_SECRET_UNAVAILABLE'));},secretResolutionTimeoutMs);})]);if((typeof secret!=='string'&&!Buffer.isBuffer(secret))||Buffer.byteLength(secret)<1||Buffer.byteLength(secret)>4096)throw new Error('WEBSITE_WEBHOOK_SECRET_UNAVAILABLE');return secret;}finally{clearTimeout(timer);}};

  async function ingestWebhook({ rawBody, headers={} }={}) {
    if(typeof rawBody!=='string'&&!Buffer.isBuffer(rawBody))throw new TypeError('rawBody is required');
    const bodyBuffer=Buffer.isBuffer(rawBody)?rawBody:Buffer.from(rawBody,'utf8');
    if (!bodyBuffer.length) throw new TypeError('rawBody is required');
    if (bodyBuffer.length>maxBodyBytes) throw new Error('WEBSITE_WEBHOOK_BODY_TOO_LARGE');
    const h=normalizeHeaders(headers);
    const eventId=h['x-growth-event-id'];
    const timestamp=h['x-growth-timestamp'];
    const signature=h['x-growth-signature'];
    if (!eventId||!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(eventId)) throw new Error('WEBSITE_WEBHOOK_EVENT_ID_INVALID');
    if(!/^\d{10}$/.test(timestamp??''))throw new Error('WEBSITE_WEBHOOK_TIMESTAMP_INVALID');
    if(!/^(?:sha256=)?[a-f0-9]{64}$/i.test(signature??''))throw new Error('WEBSITE_WEBHOOK_SIGNATURE_INVALID');
    const clockValue=clock();
    if(typeof clockValue!=='string'&&!(clockValue instanceof Date))throw new Error('WEBSITE_WEBHOOK_CLOCK_INVALID');
    const now=new Date(clockValue),sentAt=Number(timestamp)*1000;
    const receivedAt=Number.isFinite(now.getTime())?now.toISOString():null;
    if(!Number.isFinite(now.getTime())||Math.abs(now.getTime()-sentAt)>maxClockSkewSeconds*1000)throw new Error('WEBSITE_WEBHOOK_TIMESTAMP_INVALID');
    const secret=await resolveSecret();
    if (!verifyWebhookSignature({rawBody:bodyBuffer,signature,secret,eventId,timestamp})) throw new Error('WEBSITE_WEBHOOK_SIGNATURE_INVALID');
    if (replay.has(eventId)) return { status:'DUPLICATE', eventId };
    let payload;
    try { payload=JSON.parse(bodyBuffer.toString('utf8')); } catch { throw new Error('WEBSITE_WEBHOOK_JSON_INVALID'); }
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('WEBSITE_WEBHOOK_PAYLOAD_INVALID');
    const eventType=String(payload.eventType??'').toUpperCase();
    if (!EVENT_TYPES.has(eventType)) throw new Error('WEBSITE_WEBHOOK_EVENT_TYPE_INVALID');
    if(payload.contact!=null&&(!payload.contact||typeof payload.contact!=='object'||Array.isArray(payload.contact)))throw new Error('WEBSITE_WEBHOOK_CONTACT_INVALID');
    if(payload.consent!=null&&(!payload.consent||typeof payload.consent!=='object'||Array.isArray(payload.consent)))throw new Error('WEBSITE_WEBHOOK_CONSENT_INVALID');
    if(payload.consent?.marketing!=null&&typeof payload.consent.marketing!=='boolean')throw new Error('WEBSITE_WEBHOOK_CONSENT_INVALID');
    if(payload.consent?.optOut!=null&&typeof payload.consent.optOut!=='boolean')throw new Error('WEBSITE_WEBHOOK_CONSENT_INVALID');
    if(!Array.isArray(payload.productRefs??[] )||(payload.productRefs??[]).length>50)throw new Error('WEBSITE_WEBHOOK_PRODUCT_REFS_INVALID');
    const contact=payload.contact??{},productRefs=(payload.productRefs??[]).map(value=>safeReference(value,'PRODUCT_REF'));
    const normalized=Object.freeze({
      eventId,
      source:'WEBSITE',
      sourceDomain:domain,
      externalId:safeReference(payload.externalId??eventId,'EXTERNAL_ID'),
      kind:eventType,
      highIntent:HIGH_INTENT.has(eventType),
      email:safeText(contact.email,'EMAIL',320,{optional:true}),
      phone:safeText(contact.phone,'PHONE',40,{optional:true}),
      person:Object.freeze({name:safeText(contact.name,'CONTACT_NAME',200,{optional:true}),role:safeText(contact.role,'CONTACT_ROLE',120,{optional:true})}),
      company:Object.freeze({name:safeText(contact.company,'COMPANY_NAME',200,{optional:true}),website:safeText(contact.companyWebsite,'COMPANY_WEBSITE',253,{optional:true})}),
      market:safeText(payload.market,'MARKET',80,{optional:true}),
      productRefs:Object.freeze(productRefs),
      message:safeText(payload.message,'MESSAGE',5000,{optional:true,multiline:true}),
      consent:Object.freeze({marketing:payload.consent?.marketing??false,optOut:payload.consent?.optOut??false}),
      provenance:Object.freeze({eventId,sourceDomain:domain,receivedAt}),
      rawRef:safeReference(payload.rawRef,'RAW_REF',{optional:true}),
    });
    replay.add(eventId);
    while(replay.size>maxReplayEntries)replay.delete(replay.values().next().value);
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
