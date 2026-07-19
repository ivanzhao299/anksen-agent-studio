# AD-005 Runtime Security

The registered project root and real working directory are canonicalized. The working directory must be beneath the project root and an allowed path; traversal and overlap with blocked paths are rejected. Recommended absolute blocks include `.ssh`, all production `.env` files and macOS Keychains.

The adapter never enables a shell. Environment keys must be explicitly allowlisted and credential-like keys are denied. Known token formats and configured secret values are redacted before log storage. Runtime, log and output limits are mandatory. Push, main merge, deploy/release, infrastructure apply/destroy and dangerous recursive deletion produce `POLICY_DENIED` rather than being ignored.
