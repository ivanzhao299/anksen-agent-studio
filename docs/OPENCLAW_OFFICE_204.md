# OpenClaw on Office 204

## Deployment contract

OpenClaw is deployed as a complete independent managed capability application. Studio remains the control plane and exposes only a read-only health projection. OpenClaw retains its own gateway, agent loop, sessions, tools, configuration, and native Control UI.

The release source of truth is `runtime/global/managed-capability-app-registry.json`:

- upstream: `openclaw/openclaw`
- source commit: `0790d9f593ad30c940ed93b5872a8cf6d6f3cf8c`
- release: `2026.7.1-2`
- OCI image: official GHCR image pinned by immutable SHA-256 digest
- server root: `/opt/anksen/capabilities/openclaw`
- gateway: `127.0.0.1:18789`

The normal Office 204 release flow invokes `scripts/deploy-openclaw.sh`. The script is idempotent: subsequent deployments preserve the gateway token, OpenClaw state, and workspace while verifying and restarting the pinned image.

## Acceptance evidence

A successful deployment log contains all of the following markers:

1. `OPENCLAW_SERVER_INVENTORY` with non-secret host capacity.
2. `OPENCLAW_SECURITY_AUDIT critical=0`.
3. `OPENCLAW_DEPLOYMENT=PASS` with the pinned version and digest.
4. The Studio release reports its normal deployment-complete marker after the OpenClaw loopback health check passes.

The running container image reference must exactly equal the registry digest. The gateway `/healthz`, CLI health command, non-interactive doctor, and security audit must all pass. A model provider and a channel are deliberately reported as `onboarding=REQUIRED`; deployment must not invent credentials or claim an end-user conversation succeeded before those are authorized and configured.

## Administrative access

The gateway is not exposed publicly. From a machine that has approved Office 204 SSH access, create a tunnel to the server's loopback port and open `http://127.0.0.1:18789` locally. Retrieve the gateway token through the approved server-secret procedure; never paste it into source control, Studio state, issue comments, or deployment logs.

## Roll-forward and recovery

OpenClaw is digest-pinned, so recovery is a normal registry roll-forward: review a signed upstream release, replace both commit and image digest, run repository validation, and deploy through the Office 204 workflow. Persistent state is outside the container under the application root. Do not delete it during image changes.
