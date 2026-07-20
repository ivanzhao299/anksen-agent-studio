const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bghp_[A-Za-z0-9]{16,}\b/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\b(?:password|passwd|token|secret|api[_-]?key)\s*[:=]\s*\S+/i
];

export function validateBusinessRecordNote(value) {
  const text = String(value ?? "").trim();
  if (!text) throw Object.assign(new Error("BUSINESS_RECORD_NOTE_REQUIRED"), { code: "BUSINESS_RECORD_NOTE_REQUIRED" });
  if (text.length > 2000) throw Object.assign(new Error("BUSINESS_RECORD_NOTE_TOO_LONG"), { code: "BUSINESS_RECORD_NOTE_TOO_LONG" });
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw Object.assign(new Error("BUSINESS_RECORD_NOTE_CONTROL_CHARACTER"), { code: "BUSINESS_RECORD_NOTE_CONTROL_CHARACTER" });
  if (secretPatterns.some((pattern) => pattern.test(text))) throw Object.assign(new Error("BUSINESS_RECORD_NOTE_SECRET_REJECTED"), { code: "BUSINESS_RECORD_NOTE_SECRET_REJECTED" });
  return text;
}
