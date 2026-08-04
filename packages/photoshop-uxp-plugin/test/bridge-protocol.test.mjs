import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ReplayGuard, canonicalEnvelope, hmacHex, verifySignedEnvelope } = require("../src/bridge-protocol.cjs");
const { sha256Hex } = require("../src/crypto-sha256.cjs");

async function signedEnvelope(now = 1_800_000_000_000) {
  const envelope = { schemaVersion: 1, sessionId: "session-1", requestId: "request-1", nonce: "nonce-1", issuedAt: now, expiresAt: now + 60000, jobId: "job-1", payloadSha256: sha256Hex("payload") };
  envelope.signature = await hmacHex("secret", canonicalEnvelope(envelope));
  return envelope;
}

test("verifies an HMAC envelope and blocks replay", async () => {
  const now = 1_800_000_000_000;
  const envelope = await signedEnvelope(now);
  const session = { sessionId: "session-1", sessionSecret: "secret", replayGuard: new ReplayGuard() };
  assert.equal((await verifySignedEnvelope(envelope, session, { now, payload: "payload" })).status, "VERIFIED");
  await assert.rejects(() => verifySignedEnvelope(envelope, session, { now, payload: "payload" }), /REPLAY/);
});

test("rejects expired or tampered envelopes", async () => {
  const now = 1_800_000_000_000;
  const expired = await signedEnvelope(now - 180000);
  await assert.rejects(() => verifySignedEnvelope(expired, { sessionId: "session-1", sessionSecret: "secret" }, { now, payload: "payload" }), /EXPIRED/);
  const tampered = await signedEnvelope(now);
  tampered.jobId = "job-2";
  await assert.rejects(() => verifySignedEnvelope(tampered, { sessionId: "session-1", sessionSecret: "secret" }, { now, payload: "payload" }), /SIGNATURE/);
});

test("requires the signed payload and keeps replay protection without injected state", async () => {
  const now = 1_800_000_100_000;
  const envelope = await signedEnvelope(now);
  envelope.nonce = "nonce-default-guard";
  envelope.requestId = "request-default-guard";
  envelope.signature = await hmacHex("secret", canonicalEnvelope(envelope));
  const session = { sessionId: "session-1", sessionSecret: "secret" };
  await assert.rejects(() => verifySignedEnvelope(envelope, session, { now }), /PAYLOAD_REQUIRED/);
  assert.equal((await verifySignedEnvelope(envelope, session, { now, payload: "payload" })).status, "VERIFIED");
  await assert.rejects(() => verifySignedEnvelope(envelope, session, { now, payload: "payload" }), /REPLAY/);
});
