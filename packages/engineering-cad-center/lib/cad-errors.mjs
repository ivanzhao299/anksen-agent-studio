export class CadError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = "CadError"; this.code = code; this.details = details; }
}
