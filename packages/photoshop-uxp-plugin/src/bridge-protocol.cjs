"use strict";

const { bytesToHex, hmacSha256Hex, sha256Hex } = require("./crypto-sha256.cjs");
const { stableStringify } = require("./artifact-manifest.cjs");
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function randomHex(length = 32, cryptoProvider = globalThis.crypto) {
  if (!cryptoProvider?.getRandomValues) throw new Error("Secure random generation is unavailable.");
  const bytes = new Uint8Array(length);
  cryptoProvider.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function createPairingChallenge(options = {}) {
  const now = Number(options.now ?? Date.now());
  return Object.freeze({
    schemaVersion: 1,
    challengeId: `pair-${randomHex(12, options.cryptoProvider)}`,
    nonce: randomHex(24, options.cryptoProvider),
    pluginId: String(options.pluginId || "com.anksen.studio.photoshop.connected"),
    issuedAt: now,
    expiresAt: now + Number(options.ttlMs || 120000)
  });
}

function canonicalEnvelope(envelope) {
  return [
    envelope.schemaVersion,
    envelope.sessionId,
    envelope.requestId,
    envelope.nonce,
    envelope.issuedAt,
    envelope.expiresAt,
    envelope.jobId,
    envelope.payloadSha256
  ].join("\n");
}

async function hmacHex(secret, message) {
  return hmacSha256Hex(secret, message);
}

function timingSafeEqual(left, right) {
  const a = String(left || "").toLowerCase();
  const b = String(right || "").toLowerCase();
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

class ReplayGuard {
  constructor({ maxEntries = 1000 } = {}) {
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  prune(now) {
    for (const [nonce, expiresAt] of this.entries) if (expiresAt <= now) this.entries.delete(nonce);
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
  }

  assertFresh(nonce, expiresAt, now = Date.now()) {
    this.prune(now);
    if (this.entries.has(nonce)) throw new Error("BRIDGE_REPLAY_DETECTED");
    this.entries.set(nonce, expiresAt);
  }
}

const defaultReplayGuard = new ReplayGuard();

async function verifySignedEnvelope(envelope, session, options = {}) {
  const now = Number(options.now ?? Date.now());
  if (!envelope || typeof envelope !== "object") throw new Error("BRIDGE_ENVELOPE_INVALID");
  for (const field of ["sessionId", "requestId", "nonce", "jobId", "payloadSha256"]) {
    if (typeof envelope[field] !== "string" || !SAFE_ID.test(envelope[field])) throw new Error(`BRIDGE_FIELD_INVALID:${field}`);
  }
  if (envelope.schemaVersion !== 1) throw new Error("BRIDGE_SCHEMA_UNSUPPORTED");
  if (envelope.sessionId !== session.sessionId) throw new Error("BRIDGE_SESSION_MISMATCH");
  if (!/^[a-f0-9]{64}$/i.test(envelope.payloadSha256)) throw new Error("BRIDGE_PAYLOAD_HASH_INVALID");
  if (!("payload" in options)) throw new Error("BRIDGE_PAYLOAD_REQUIRED");
  const payload = options.payload;
  const payloadBytes = typeof payload === "string" || payload instanceof Uint8Array || payload instanceof ArrayBuffer ? payload : stableStringify(payload);
  if (!timingSafeEqual(sha256Hex(payloadBytes), envelope.payloadSha256)) throw new Error("BRIDGE_PAYLOAD_HASH_MISMATCH");
  if (!Number.isFinite(envelope.issuedAt) || !Number.isFinite(envelope.expiresAt) || envelope.issuedAt > now + 30000 || envelope.expiresAt < now || envelope.expiresAt - envelope.issuedAt > 120000) throw new Error("BRIDGE_REQUEST_EXPIRED");
  const expected = await hmacHex(session.sessionSecret, canonicalEnvelope(envelope));
  if (!timingSafeEqual(expected, envelope.signature)) throw new Error("BRIDGE_SIGNATURE_INVALID");
  (options.replayGuard || session.replayGuard || defaultReplayGuard).assertFresh(envelope.nonce, envelope.expiresAt, now);
  return { status: "VERIFIED", sessionId: envelope.sessionId, requestId: envelope.requestId, jobId: envelope.jobId, credential_values_read: false };
}

module.exports = { ReplayGuard, canonicalEnvelope, createPairingChallenge, hmacHex, randomHex, timingSafeEqual, verifySignedEnvelope };
