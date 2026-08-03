"use strict";

class StudioClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || "").replace(/\/$/, "");
    this.fetch = options.fetch || globalThis.fetch;
    this.credentialReferenceId = options.credentialReferenceId || null;
  }

  assertConfigured() {
    if (!this.baseUrl.startsWith("https://")) throw new Error("Studio endpoint must use HTTPS.");
    if (!this.fetch) throw new Error("Fetch API is unavailable.");
  }

  async request(path, init = {}) {
    this.assertConfigured();
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-anksen-client": "photoshop-uxp",
        ...(this.credentialReferenceId ? { "x-credential-reference": this.credentialReferenceId } : {}),
        ...(init.headers || {})
      }
    });
    if (!response.ok) throw new Error(`Studio request failed: ${response.status}`);
    return response.status === 204 ? null : response.json();
  }

  getApprovedJob(jobId) {
    return this.request(`/api/runtime-adapters/photoshop/jobs/${encodeURIComponent(jobId)}`);
  }

  reportResult(jobId, result) {
    return this.request(`/api/runtime-adapters/photoshop/jobs/${encodeURIComponent(jobId)}/result`, {
      method: "POST",
      body: JSON.stringify(result)
    });
  }
}

module.exports = { StudioClient };
