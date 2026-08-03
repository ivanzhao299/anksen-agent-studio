import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { hmacSha256Hex, sha256Hex } = require("../src/crypto-sha256.cjs");

test("pure JavaScript SHA-256 matches Node for Unicode and binary input", () => {
  for (const value of ["", "abc", "金湖科创产业园", new Uint8Array([0, 1, 127, 255])]) {
    const expected = crypto.createHash("sha256").update(value).digest("hex");
    assert.equal(sha256Hex(value), expected);
  }
});

test("pure JavaScript HMAC-SHA-256 matches Node", () => {
  const expected = crypto.createHmac("sha256", "session-secret").update("signed\nmessage").digest("hex");
  assert.equal(hmacSha256Hex("session-secret", "signed\nmessage"), expected);
});
