# ANKSEN AI Growth Platform — Continuation Handoff

Updated: 2026-08-26
Status: ACTIVE
Branch: `feature/anksen-ai-growth-platform`
Draft PR: `#35`
Program Issue: `#34`

## Product and architecture boundary

ANKSEN AI Growth Platform is a reusable, multi-tenant product on the existing Studio control plane. KingTurf is the first pilot tenant, not the Core boundary. Reuse the existing Kernel, Planner, Scheduler, Worker, Runtime, Approval, Audit, RBAC, credential-reference and activation gates; never create a second orchestration stack.

All authoritative records and events require `organizationId + workspaceId + tenantId`. External writes require declared capability, idempotency, audit and policy approval where applicable. CRM/ERP/RFQ/quote/order systems remain authoritative downstream. Do not push, merge, deploy, migrate production data or enable a real Runtime without explicit authorization.

## Implemented and verified baseline

The executable path covers GA-000~017:

`Discovery -> Identity Resolution -> Lead -> Explainable Score -> Engagement -> Next Best Action -> Opportunity -> Downstream Handoff -> Revenue Attribution -> Executive Report`

The current branch also includes a durable PostgreSQL schema/store, atomic tenant-scoped identity resolution, immutable score history, Customer 360 persistence, KingTurf and unrelated-tenant packs, governed publishing, signed website ingestion, default-disabled official publishing and Business API connectors, and a shared outbound-delivery ledger. The webhook-to-lead path runs in one database transaction with replay detection, cross-source identity reuse, cross-tenant isolation and rollback to human review when identities conflict. Publishing and commercial handoff require approval references and record bounded attempts, sanitized errors, authoritative external IDs and reconciliation without persisting credentials or commercial payloads. These are implementation and acceptance slices, not production authorization.

Run the synchronized local gate before continuing:

```sh
pnpm install --frozen-lockfile
pnpm growth-platform:acceptance
```

The gate runs Core unit and GA acceptance tests, the evidence-based Pilot readiness check, production-connector tests, PostgreSQL store and delivery-ledger tests, signed-event transaction integration tests, an isolated PostgreSQL persistence smoke, and the sanitized Growth delivery operations surface test.

Growth CI's `growth-postgres` job runs Domain typecheck and this complete root gate. Workflow paths explicitly include the business source connector/governance implementations, base/approval up/down migrations and dependency lockfile, so these boundaries cannot bypass CI by filename.

## Direct continuation priority

1. Keep the unified local/CI gate green and close persistence/interface inconsistencies first.
2. Keep GA-004~007 transaction, identity-review and score-history evidence green as connector inputs expand.
3. Governed retry/reconciliation APIs now use existing Console RBAC, CAS and immutable delivery audit. Keep the current browser surface read-only until end-to-end authenticated API evidence and existing Worker connector dispatch are proven.
4. Keep the Pilot readiness report fail-closed: implementation evidence is green, while activation remains blocked until every credential, health, approval, feature-flag, central Production Ops policy, Runtime Gate and explicit production-authorization check is independently proven.
5. The sanitized Pilot readiness evidence is projected into the authenticated Growth Console without an activation action. Central Production Ops policy, tenant-scoped/unexpired Business Source Governance approval, tenant production feature flag, exact existing Runtime Activation Gate binding and complete governed connector-activation preflight coverage override their JSON fixture fields; keep tenant isolation and fail-closed API evidence green.
6. Delivery failures, reconciliation mismatches and open identity-review cases now come from scoped PostgreSQL evidence. Identity resolution/dismissal has separate reviewer RBAC, exact-version CAS, candidate validation and immutable audit; keep the browser projection read-only until authenticated end-to-end action UX is proven.
7. Signed ingress, publishing and Business API now have tenant-scoped, default-disabled, CAS/audited connector bindings. Publishing additionally requires an active channel account. The read-only health-probe service has no production adapter registered. Connector activation now has a one-time Gate over existing business approval plus separate `production.request` authorization, but no Console execution endpoint is exposed and no real binding has been activated.
8. The Console provides a read-only activation-preflight projection for production-operations handoff without exposing authorization or credential references. Pilot explicit-production-authorization evidence now requires a current READY preflight for every required connector kind; missing or duplicate kinds fail closed. It reads the existing Production Ops bundle and visibly reports the authoritative global blocked gate. The Gate proves Access Center authorization through the separate `growth_production_operator`, while a second Production Ops seam defaults to deny. Exact-version activation/disable are exercised only by an explicit local governance fixture; neither operation has a Console endpoint. Keep both unexposed until the central policy itself has separately governed authoritative production authorization.
9. Validate KingTurf through governed connectors and downstream mappings only after the existing gates authorize it.
10. Keep the second non-KingTurf tenant proof green without a Core or schema fork.

The tenant production feature-flag store is also fail-closed at its mutation seam: both enable and disable require separately injected Production Ops authorization, and the default constructor cannot change a flag. The Console instantiates that default-deny form for readiness only and exposes no mutation endpoint.

Tenant packs now validate an optional immutable `metadata.runtimeActivationBinding` against the exact existing CODEX Activation Gate identifiers. An absent binding remains valid and produces `NOT_BOUND`; a partially configured or non-CODEX binding is rejected while loading the pack. Do not add KingTurf IDs until they refer to governed existing Runtime records.

The connector-binding store now defaults both configuration writes and health-evidence writes to unauthorized. The health-probe service separately rejects the actor before it reads binding context or invokes an adapter, proven by a zero-call test. Console constructs the default-deny store for read-only readiness. Tests inject narrow actor authorizations explicitly; do not add a mutation endpoint or production probe adapter without mapping it through existing Access Center and Production Ops policy.

Connector activation now binds the reused Business approval to the precise approved record version: the approval's requested object version plus the approval transition increment must equal the current record version. Historical/stale approvals fail preflight even if their status remains `APPROVED`.

Business Source approval latest-wins semantics use migration 020's monotonic `sequence_id`, not timestamps. Fresh Business Runtime initialization now always applies Growth governance migrations 018–020 after the base schema while holding advisory lock `16012027`; keep this ordering synchronized with `migrateGrowthPlatform`.

Migration 021 makes production feature-flag events database-immutable: direct UPDATE and DELETE, including a parent cascade, are rejected. The Business Runtime and Growth migration runner both apply it after migration 020 through the shared `growth_schema_migration` ledger. Retention or erasure must therefore be an explicit governed schema operation, not an application-store side effect.

Migration 022 extends database immutability to `growth_event`, score snapshots, delivery events, identity-review events and connector-binding events. It is applied by the Growth migration runner after all source tables exist and is part of root Growth acceptance. Do not bypass these triggers for normal cleanup or application workflows.

Authorization-reference validation for connector activation and the tenant production feature flag now rejects `sk-`, GitHub-token, Bearer, PEM and JWT-like secret shapes as well as explicit secret key/value strings. Keep identifiers opaque and reference-only; never place credential material in an authorization field.

Outbound delivery registration now validates every persisted reference before fingerprinting. Migration 023 adds PostgreSQL reference-only and secret-material constraints to the ledger; both store-level and direct-SQL rejection are in acceptance. This migration is Growth-runner-only because it depends on delivery migration 014.

Migration 024 and `complete()` apply the same trust boundary to adapter-returned external ID/status. A token-like adapter response cannot complete an operation or enter the ledger; execution records only the sanitized validation error and direct SQL is constraint-rejected.

Connector readiness and the activation Gate both reject health observations later than their local assessment clock. The write path may accept bounded clock skew for transport tolerance, but future evidence stays `STALE` and cannot authorize activation until time catches up.

Channel-account and connector-activation authorization expiry is strict: equality with the assessment clock is expired. Tests cover both exact boundaries; preserve `expiresAt > now` consistently across production gates.

Production feature-flag input is strict at both trust boundaries. The store accepts only actual booleans and bounded uppercase flag identifiers, preventing string coercion such as `"false"` from enabling production behavior. Migration 025 mirrors the key grammar and secret-material rejection in PostgreSQL; its direct-SQL acceptance case must remain green, and both database initializers must keep applying it after migration 024/021 respectively.

Production authorization is time-bounded, not merely future-dated. Connector activation and tenant production feature flags default to a maximum 366-day authorization lifetime; overlong authorization is blocked, and non-positive/non-finite configured windows fail closed. Preserve this ceiling or deliberately tighten it—do not create a perpetual production authorization path.

Business Runtime and the full Growth initializer now use one checksum-aware migration runner under the existing advisory lock. The ledger stores SHA-256 for every applied script, safely adopts legacy null-checksum rows once, and rejects later same-name drift before executing SQL. The dedicated PostgreSQL test is part of root acceptance; never rewrite an applied migration—add a new numbered migration.

Freshness arithmetic is fail-closed. Connector readiness rejects non-finite clocks and invalid/over-24-hour health windows; activation and feature-flag gates reject invalid clocks, and injected configuration cannot widen the 366-day production authorization ceiling. Keep these policy ceilings as upper bounds, not only constructor defaults.

Connector health evidence is bounded before authorization: the local clock must be finite and the reference must be non-secret, control-character-free and no longer than 512 characters. The write still persists only a SHA-256 hash. Tests prove invalid evidence causes zero authorization and database calls.

Outbound retry state is now schedule-bound. Only literal `retryable: true` plus remaining budget and a retry timestamp 1 second–24 hours ahead can enter `RETRYABLE`; all malformed or missing schedules become terminal with sanitized `last_error.retryable=false`. Registration restricts attempts to 1–20 and operation/capability vocabulary, with migration 026 enforcing the latter in PostgreSQL. This migration is full-Growth-only because it depends on delivery migration 014.

Retry and reconciliation are default-deny at the delivery store seam. Console supplies its evaluated Access Center action decision, and the injected integrations verify the action-specific capability (`business.work.control` for retry, `proposal.approve` for reconciliation). Keep both route and store checks; do not revert to trusting a non-empty actor ID.

Identity-review decisions are likewise default-deny in the store, with Console injecting its evaluated `proposal.approve` decision. Human resolution reasons are bounded and reject controls/common raw-secret shapes before authorization. Migration 027 repeats the reason constraint in PostgreSQL and is Growth-runner-only because it depends on identity-review migration 016.

The signed website ingress contract now requires `x-growth-event-id`, 10-digit Unix-second `x-growth-timestamp` and `x-growth-signature`. Sign the exact byte sequence `timestamp.eventId.rawBody` with HMAC-SHA256. Default clock skew is 300 seconds (hard maximum 900), and duplicates still authenticate before replay handling. Producers using the former body-only signature must upgrade before activation; no named production connector is active.

After HMAC verification, website payloads use a bounded schema rather than coercion: only the controlled event vocabulary, literal consent booleans, safe reference IDs, up to 50 product refs and bounded text fields are accepted. Persistent ingestion independently checks the security-critical normalized event contract and rejects adapter bypass/future evidence before acquiring a database connection.

The adapter replay cache is deliberately bounded: 10,000 entries by default and never above 100,000, evicting oldest IDs. Body configuration is also hard-capped at 1 MiB. Treat this cache as a fast path only; the PostgreSQL canonical-event idempotency key is the durable replay defense after eviction or restart.

Official publishing and business adapters now use `official-api-safety.mjs`. Activation booleans are strict, timeouts stay within 100 ms–30 s, HTTP test escape is loopback-only, endpoint userinfo/query/fragment is denied and success bodies are streamed under a configured 64 KiB default/1 MiB ceiling. Returned IDs/statuses are reference-only, publishing drops remote URLs, and business payloads reject secret-bearing keys/values plus excessive shape/size. Preserve this shared boundary for future official connectors.

Credential resolution is included in outbound availability control rather than occurring before all timers. Each official adapter gives the resolver the configured bounded timeout; hangs are retryable, provider exceptions are sanitized, and malformed tokens are terminal before fetch. Do not log or rethrow resolver messages.

Migration 028 closes canonical cross-tenant relationship holes with composite `(id, organization, workspace, tenant)` foreign keys for identity, engagement, score, opportunity and revenue. Matching Store writes also require the scoped parent in their `INSERT ... SELECT`. Event idempotency now verifies exact canonical content after a conflict instead of treating every collision as a duplicate. This migration is full-Growth-only and the dedicated PostgreSQL integrity test is in root acceptance.

Migration 029 and `PostgresGrowthStore` constrain canonical identity to EMAIL/PHONE/DOMAIN with type-specific normalized shapes, lowercase bounded values and controlled uppercase sources. Phone punctuation is removed before matching; domains are hostnames rather than URLs. Keep new identity kinds out until their normalization and database grammar are explicitly designed.

Tenant scope IDs are a shared security primitive: Growth Core accepts only 1–128 index-safe ASCII reference characters. Migration 030 dynamically installs matching checks on all 15 complete-Growth scope tables; it must remain full-Growth-only so the ledger cannot mark it applied before later tables exist. Root PostgreSQL acceptance asserts all 15 constraints.

Canonical immutable events are bounded in `PostgresGrowthStore` and migration 031: controlled event vocabulary, reference IDs, schema 1–100, object payload at most 64 KiB and application-side future-time rejection. The database check is intentionally `NOT VALID` so historic pre-contract immutable `TEST_EVENT` fixture rows do not block migration, but PostgreSQL enforces it for every new row. Do not validate or delete legacy rows outside an explicit governed retention operation.

Canonical lead roots are bounded at both trust boundaries. `PostgresGrowthStore.upsertLead` validates IDs/source/state, object/array JSON shapes and byte sizes, optional market/ICP refs, finite clock and future creation time. Migration 032 immediately checks every new/direct row with `NOT VALID` legacy rollout semantics. Do not expand person/company/score into unbounded document storage.

Canonical engagements use the same two-boundary contract. `PostgresGrowthStore.recordEngagement` rejects unsafe engagement/lead IDs, uncontrolled kind/channel values, non-object or over-64 KiB payloads, invalid clocks and future evidence before SQL. Migration 033 immediately constrains all new/direct rows while leaving legacy validation to an explicit governed retention operation.

Canonical score history remains append-only and is now exact-replay idempotent. `recordScore` bounds IDs, score type, numeric ranges, model/policy refs, factor/dimension JSON and calculation time before SQL; an existing snapshot ID with different immutable content fails closed. Migration 034 mirrors the structural limits for new/direct rows without rewriting legacy history.

Opportunity and revenue persistence now closes the remaining canonical write boundary. Opportunity IDs are lead-stable and fields/downstream refs are bounded; revenue attributions require safe scoped relation refs, non-negative finite amounts, uppercase three-letter currency, object metadata and non-future timestamps. Revenue replays must match every immutable field. Migration 035 applies matching new-row checks without introducing another sales state machine.

Connector binding control inputs are validated before the authorization callback: adapter, binding and actor IDs are bounded and secret-resistant, CAS versions are positive integers, and configuration clocks must be finite. Migration 036 mirrors binding/reference/host/version/hash structure for new direct rows. These checks never activate a binding, resolve a credential value or enable the Runtime.

Read amplification is bounded at the aggregate boundary. Customer 360 validates its lead ID and caps each independent history relation at 200 newest rows; connector audit trails cap the recent window at 500 and then restore chronological presentation. Add cursor pagination before increasing these ceilings rather than returning unbounded tenant history.

Identity resolution validates its target lead reference before the atomic insert/select operation. Migration 037 adds the matching lead ID check for new direct rows (the identity primary key is already native UUID), complementing migration 029's normalized identity value/source contract. Existing deterministic matching and human review behavior is unchanged.

Delivery control methods now share pre-authorization validation for operation/actor IDs, CAS versions and clocks; completion and reconciliation also require bounded, secret-resistant external references. Failure no longer reads the ledger before clock/control validation. Delivery audit is capped at 500 recent rows, and migration 038 mirrors fingerprints, actors, counters and 4 KiB error envelope structure for direct writes.

Identity review decisions validate case/actor/selected-lead references, positive versions, clocks, reasons and dismissal selection rules before authorization or SQL; review audit is capped at 500 recent rows. Migration 039 bounds candidate/evidence arrays, source/hash/idempotency roots and resolution actors for new direct rows. It preserves the existing human-only decision boundary.

Production feature-flag control now validates the actor and optional CAS version before invoking production authorization or opening a transaction. Migration 040 ensures a disabled flag/event cannot retain an authorization reference/hash or expiry, and bounds control IDs/versions. No flag was enabled by this implementation work.

Connector activation gate inputs are normalized before access checks or SQL: activation/binding/incident/actor refs, positive versions, finite clocks and bounded secret-free emergency reasons. Preflight listing also fails closed on an invalid clock. The Console remains read-only for activation and the independent Production Ops gate remains disabled.

Runtime readiness validates every exact binding reference before SQL. Unsafe binding or credential-reference rows block readiness, while credential/health probe exceptions are converted to `CREDENTIAL_REFERENCE_READY`/`RUNTIME_HEALTH` blockers. The gate remains evidence-only: it never consumes approval, reads a credential value or starts Runtime.

Growth's shared tenant source-approval readiness projection validates scope/application identifiers and clock before SQL, and returns at most 100 connectors. Request and decision semantics remain owned by the shared business governance component; do not fork a Growth-specific approval state machine.

Publishing connector evidence validates up to 20 requested platform labels and a finite clock before querying at most 100 accounts. Unsafe credential references are excluded in SQL, and channel authorization must expire within 366 days. The projection contains counts and platform requirements only; no credential reference or value is returned.

Persistent website ingestion now captures one validated time snapshot per call and injects it into the transactional Store and scoring engine. All fallback occurrence/creation times and any identity-review record created after rollback reuse the snapshot, so a non-monotonic clock provider cannot split one event across inconsistent timestamps.

Revenue attribution has an explicit per-row ceiling of 1 trillion currency units in the Store and migration 041. The value remains currency-specific and is never cross-currency summed; the ceiling prevents unbounded PostgreSQL numeric values from degrading the bounded Customer 360 JavaScript aggregate.

Customer 360 returns sorted `revenueByCurrency`. `totalRevenue` is retained for compatibility only when the bounded history has at most one currency; it is `null` for multi-currency history. Do not introduce FX conversion without an authoritative rate source, timestamp and policy.

Growth migration execution now wraps each new migration SQL and checksum ledger insert in one transaction while retaining the session advisory lock. Fault injection verifies a ledger-write failure removes the schema change. Do not add non-transactional DDL such as concurrent index creation to this runner without a separate governed protocol.

Website HMAC secret resolution now has a configurable 100–5000 ms bound (default 1000 ms) and a 4 KiB material ceiling. A hanging resolver, invalid type or oversized result fails as unavailable before HMAC; the secret remains runtime-only. Keep server-level request/header limits in front of the adapter as the first network boundary.

Official outbound adapters now require an `application/json` or structured `+json` success media type and reject malformed JSON explicitly after the streaming byte limit. Error response bodies are cancelled, and retry hints are decimal-only and at most eight digits. No upstream body/header detail is copied into errors.

`growthMigrationPaths` is an exported immutable manifest. Acceptance checks strict numeric ordering, uniqueness, every Growth up file, shared migration 020 and down-file coverage from 018 onward. Migrations 012–017 intentionally have no destructive down scripts because they establish data-bearing baseline tables.

Use `inspectGrowthMigrations(client, growthMigrationPaths)` for a read-only deployment preflight. It reports per-file checksums and READY/PENDING/BLOCKED; drift, a legacy null checksum or an applied ledger entry absent from the immutable manifest blocks, while a missing ledger is represented as pending. Inspection never creates the ledger or applies DDL.

Inspection limits the ledger SELECT to 1,001 rows for 1,000-row overflow detection. Malformed/oversized names and checksums are represented only as sanitized blockers, and an oversized ledger blocks without unbounded output.

The canonical `migrateGrowthPlatform` path runs strict manifest inspection inside the advisory lock before applying pending migrations. It cannot bypass drift/unexpected/invalid ledger blockers when the separate status command was skipped. The business-database subset migration call remains non-strict because it intentionally owns only its five shared files.

The migration advisory lock uses `pg_try_advisory_lock` polling bounded to 5 seconds by default (25 ms interval; wait configurable only from 0–30 seconds). This tolerates brief parallel startup, then returns retryable `GROWTH_SCHEMA_MIGRATION_LOCK_BUSY` without executing migrations or an unmatched unlock.

Historical migration 018 contains an immutable outer `BEGIN/COMMIT` wrapper. The runner hashes the original file but strips only that outer wrapper for execution and rejects remaining top-level transaction controls, preserving the runner-owned DDL-plus-ledger transaction without rewriting an applied migration.

Both business and Growth PostgreSQL runtimes use the same bounded pool-size parser. `BUSINESS_DATABASE_POOL_MAX` defaults to 10 and must be an integer from 1 through 50 before any new pool is used.

Business database URLs are capped at 4 KiB and produce stable errors without retaining malformed input. Controls, fragments, secret-like query keys and oversized userinfo are denied; normal non-secret PostgreSQL options such as `sslmode` remain allowed. Remote hosts still require the existing explicit allow flag.

`BUSINESS_DATABASE_URL_FILE` accepts only an absolute control-free path up to 1,024 characters whose target is a regular 1–4,096 byte file. Relative paths, directories, empty and oversized secret files are rejected before URL parsing.

New business, Growth and migration-status pools apply the same `BUSINESS_DATABASE_TIMEOUT_MS` to connection, client query and PostgreSQL statement timeouts. It defaults to 10 seconds and accepts only integer 100–60,000 ms; injected pools remain untouched.

Official publishing and business API fetches use a shared wall-clock Promise timeout as well as AbortSignal. Custom fetch implementations that ignore abort still resolve into sanitized retryable `*_TIMEOUT` failures within the configured 100–30,000 ms.

That timeout covers fetch, HTTP status handling and complete bounded JSON body consumption. A peer that returns headers then stalls its stream cannot hold the delivery worker past the same deadline.

Website secret providers receive an AbortSignal. The bounded 100–5,000 ms secret-resolution timeout now aborts an underlying vault/reference lookup as it returns the sanitized unavailable result.

Official publishing/business credential resolvers likewise receive an AbortSignal. Their 100–30,000 ms deadline aborts the underlying lookup before surfacing the sanitized retryable credential-timeout code.

Official API JSON response readers reject malformed, negative, fractional, unsafe or oversized declared content lengths before consuming the body, cancel rejected streams and independently enforce the actual streamed-byte limit.

Official API content type and length metadata must be native strings returned by the response header interface. Coercion-capable objects fail closed and rejected streams are cancelled.

Website ingress accepts only native string/Buffer bodies and object/standard Headers collections. Event/timestamp and exact 64-hex SHA-256 signature shape are checked before secret resolution, so malformed requests cannot call the secret provider.

Website ingress samples its clock once, accepts only native strings or Dates and records a canonical ISO timestamp. Clock-like coercion objects fail before secret resolution and cannot influence freshness or provenance.

Website signature verification is fixed to SHA-256 and requires native signature, secret, event ID and timestamp controls with exact bounded shapes. Algorithm selection and object coercion are denied.

Website header normalization accepts only plain objects or native `Headers`. Case-folded duplicate names and custom iterable collections fail before secret resolution, so signature inputs cannot be shadowed by ambiguous headers.

Authenticated website payloads enforce closed top-level, contact and consent field sets. Unknown nested metadata or credential-like additions are rejected instead of being silently discarded before persistence.

Tenant data-owner approval request/decision paths validate native scope and bounded connector, owner, mapping, approval, version, reason and expiry controls with one clock sample before SQL. Invalid work cannot even query the connector.

Source reconciliation checkpoint writes validate native scope and bounded connector, batch, mapping, cursor, count and observed-time evidence before SQL. A single clock sample and normalized values drive both the stored row and reconciliation hash.

Business-source connector and credential-reference reads accept only native bounded scope/ID controls before SQL. Returned credential references are separately validated, so a poisoned secret-like database value is never exposed as a reference.

Tenant source-readiness projection enforces the SQL row ceiling and validates native connector, credential, mapping and expiry evidence before checks or serialization. Poisoned rows and coercion objects fail closed.

Data-owner approval projection validates references, status, version, bounded reason and native dates, then emits canonical ISO dates. Poisoned approval rows cannot be exposed through readiness or mutation responses.

Concurrent tenant or unscoped approval requests recover only the exact pending-approval unique constraints and re-read the winning row. Other uniqueness failures remain visible.

Approval expiry accepts only native string or Date values and validates the instant before SQL. Custom date-coercion objects cannot execute during governance validation.

Authoritative source ingestion validates native tenant/connector controls, idempotency/evidence/cursor fields and each record's primitive identity envelope before its first SQL query. Unsafe coercion objects cannot create failed-batch side effects.

Source record fields must be a plain object with at most 100 data properties, safe keys and bounded native scalar values before SQL. Getters/setters, nested objects, non-finite numbers and control-bearing or oversized strings fail without invocation.

Source ingestion snapshots closed plain-data actor, batch and record envelopes before validation, then reuses the snapshot for duplicate detection, failure audit and the transaction. Unknown/symbol fields and accessors cannot execute or mutate the post-validation view.

Source connector registration also snapshots closed plain-data configuration and actor envelopes before consulting the clock or SQL. Accessors and undeclared controls fail without side effects.

Source connector list and batch-history reads apply the same closed plain-data scope boundary before SQL, rejecting accessors plus undeclared or symbol controls.

Data-owner approval request and decision inputs plus actor scopes are closed plain-data envelopes. Accessors and undeclared/symbol controls fail before clock or SQL access.

Reconciliation checkpoint input, batch evidence and scope are snapshotted before destructuring. Accessors cannot execute before validation or change the evidence between hashing and persistence.

Tenant readiness snapshots scope and options before reading application and limit controls, keeping the read-only activation evidence path free from caller-controlled accessors.

The shared governed connector lookup snapshots scope before resolving IDs, so readiness, credential-reference, approval and checkpoint reads inherit one fail-closed accessor boundary.

Source readiness checkpoint projection requires scoped closed database evidence, native/string dates, bounded native-or-decimal counts and controlled reconciliation states. Database coercion methods are not invoked.

Approval rows are closed database-evidence snapshots before presentation. Status, date and reference validation cannot invoke row accessors or accept undeclared columns.

Governed connector lookup validates a closed tenant-scoped database row, connector enums, bounded configuration, references and native/string dates before readiness or approval code receives it.

Source readiness evaluates data-owner approval and mapping Gates only from the validated approval projection, not the raw database row.

Source readiness selects the latest approval for the exact tenant, or only an unscoped approval when no tenant is supplied, and fails authorization at expiry. Tenant-scoped approval cannot authorize unscoped ingestion.

Readiness also verifies the projected approval tenant after the SQL read and fails closed when returned database evidence contradicts the requested scope.

Approval request verifies connector and tenant scope on pending reads, concurrent unique-key recovery and inserted rows before returning approval evidence.

Approval decision validates the returned approval ID and data-owner identity against the authorized update controls before reporting success.

Checkpoint preserves tenant scope through persistence and post-write readiness, and revalidates exact-tenant approval, expiry and mapping version with its checkpoint clock before writing.

Smart Park sync revalidates readiness after remote I/O and before ingest, requiring the same approval ID, version and mapping. Revocation or approval changes during the read produce zero business writes.

Console direct connector ingestion fails closed with `BUSINESS_SYNC_REQUIRES_MANAGED_SOURCE_ADAPTER`. Authoritative non-fixture writes must enter through a governed managed adapter rather than browser-supplied records.

Console connector registration and source-approval failures return stable controlled status codes only; raw database or provider exception messages are not reflected to clients.

Managed source ingest carries native approval ID, version, mapping and tenant evidence into the business-write transaction. The store locks the exact unexpired approval `FOR SHARE`; authorization conflict rolls back before record mutation.

Fault injection verifies an empty approval-lock result rolls back before any business-record read or write.

Managed-source duplicate detection runs only after the transaction acquires the approval lock. An unauthorized caller cannot use the idempotency fast path to observe batch evidence.

Managed authorization is a closed native envelope whose tenant must equal the actor tenant. Accessors, coerced versions and cross-tenant evidence fail before SQL.

Invalid managed payloads acquire the same approval lock before failed-batch or connector-error persistence, preventing forged authorization from poisoning connector state.

Successful and failed idempotency-race recovery reauthorizes in a new transaction before reading the winning managed batch; rollback cannot create an authorization bypass.

Smart Park credential configuration is a closed plain-data snapshot. Accessors and unknown keys are rejected without invocation, and base origins cannot include query or fragment state.

File credential references are native, opened with no-follow semantics, permission/type checked on the descriptor, read through a 16 KiB cap and parsed as an exact two-field JSON object. Path races, symlinks and parse errors fail closed.

Growth CI explicitly watches the source credential resolver and runs its reference-source security tests through the authoritative acceptance gate.

Smart Park adapter options are a closed descriptor snapshot before defaults are applied. Constructor accessors and undeclared controls cannot execute.

File resolver options likewise accept only a native `baseDir` data property. Constructor accessors and coercion objects fail before path resolution.

Smart Park changed-record aggregation is capped at the connector's 100-record atomic batch limit. Larger backlogs fail at the read boundary before failed-batch or connector-state side effects.

Smart Park read controls, sync-service dependencies, and organization/workspace/project/tenant/user scope are closed descriptor snapshots. Accessors and undeclared fields fail before credentials, governance, or remote reads, while all sync phases share the same copied scope values.

The sync service independently projects an injected adapter result into a closed descriptor-backed envelope. Counts, availability, dates, cursor presence, and the 100-record ceiling must agree before authorization recheck or ingestion.

Non-empty adapter results must be chronologically ordered, and the last record timestamp must exactly match both the cursor and observation evidence used for idempotency and checkpointing.

The sync service re-projects both readiness responses and verifies connector identity, approved state, approval identity/version/mapping, and exact tenant scope. Forged or accessor-backed governance results fail before credentials, remote reads, or ingestion.

Connector and credential-reference identifiers are native, bounded, secret-screened references at the sync boundary; coercion objects cannot reach governance or the adapter.

Post-ingest batch evidence must independently match connector, idempotency key, cursor, observation time, source count, and APPLIED/FAILED count invariants before checkpointing. Returned checkpoint evidence must then match the exact batch, authorization, cursor, counts, and reconciliation outcome.

Batch evidence counts remain bounded by the 100-record atomic limit. Malformed checkpoint/readiness envelopes collapse to `SMART_PARK_SOURCE_CHECKPOINT_RESULT_INVALID` without executing accessors.

Authorization is revalidated after every remote read, including an empty read. `NO_CHANGES` cannot be returned from an approval revoked or version-changed while the adapter was reading.

Multi-page Smart Park reads require a stable total and matching optional page metadata. Short intermediate pages, total drift, and page/page-size mismatches fail closed instead of producing a partial checkpoint.

Duplicate source-record keys, including overlaps across remote pages, fail at the adapter boundary before the connector can persist a FAILED batch or transition to ERROR.

Remote observation timestamps over five minutes ahead of the validated adapter clock fail before ingestion, matching the connector future-evidence gate without persisting a FAILED batch.

The adapter snapshots and validates its clock before credential resolution or network I/O. The same snapshot governs future-record checks and empty-read evidence.

Credential origins are bounded native strings and reject control characters or surrounding whitespace, so URL-parser normalization cannot change the governed origin text before a request.

Resolved bearer tokens must be exact non-whitespace printable ASCII strings, preventing header normalization or Unicode encoding from changing credential bytes after resolution.

Streamed source JSON uses fatal UTF-8 decoding. Malformed wire bytes are rejected rather than silently replaced and persisted as altered business data.

Smart Park responses must expose a cancelable byte stream. There is no fallback to `response.text()`, which cannot preserve the same byte limit, timeout, and strict decoding guarantees.

Every stream read result is a closed descriptor snapshot with a native boolean completion flag and native `Uint8Array` bytes. Accessor-backed or forged chunks cannot execute or bypass byte accounting.

Response media types are closed to JSON or `+json`, with no charset or explicit UTF-8 only. Conflicting charsets and undeclared profile parameters fail before body processing.

Smart Park mapping enforces connector identity and scalar-field length/control-character limits before ingestion, so oversized upstream content cannot create a FAILED batch or connector ERROR transition.

Smart Park chronology is evidence-ordered: creation cannot follow the source observation, and optional completion must fall between creation and observation before SLA/completion evidence is mapped.

`NO_CHANGES` retains remote `totalAvailable` after authorization revalidation, distinguishing an empty source from a fully checkpointed non-empty source without creating a batch.

The sync service independently closes injected mapped records to the Smart Park `service_order` schema, known statuses/field options, exact completion tuple, native scalar limits, and record-relative timeline before the connector store.

Injected source results must be strictly ordered by `(observedAt, sourceRecordKey)` with unique source keys, keeping cursor-keyed payloads deterministic and audit-reproducible.

Smart Park batch idempotency and evidence references bind both the normalized cursor and SHA-256 of the canonical validated record payload. Different payloads at the same cursor cannot be mistaken for an existing batch.

Returned ingest evidence must identify the Smart Park application and expose a native duplicate flag in addition to exact connector/batch identity. Cross-application or ambiguous results never reach checkpointing.

Returned checkpoint evidence must bind `lastObservedAt` exactly to the source observation and expose a canonical update timestamp in addition to matching cursor, batch, authorization, counts, and reconciliation status.

The root acceptance command and Growth CI path filters include the Smart Park reference source test suite, including its governed source-to-shared-Runner loop.

Smart Park adapter timeout/pagination controls are bounded native integers, and empty reads validate an injected native Date clock. Coercion-capable control values and clock impostors are rejected.

Smart Park credential resolver and network client exceptions are sanitized to controlled adapter codes. Provider error messages cannot escape, while timeout, HTTP and response validation errors keep their established codes.

Smart Park records are converted from bounded plain data descriptors before timestamp or mapping access. Getters/setters, symbols, unsafe keys and exotic prototypes fail without executing source-controlled code.

Source ingestion takes one native valid Date clock sample before SQL and reuses it for freshness checks plus failed/success audit timestamps. Clock coercion and intra-operation timestamp drift are denied.

Under the source-record row lock, existing ID/type/version/observed-time evidence is validated before stale-write comparison. Invalid or coercion-capable timestamps fail the transaction instead of producing `NaN` and permitting an overwrite.

Source connector and batch-history reads validate native tenant/connector controls before SQL and use fixed 100/50-row ceilings. Coercion objects cannot select another scope and read projections remain bounded.

Source connector/batch projections validate bounded references, enums, counts, versions and native dates, canonicalize time to ISO and redact unsafe error summaries. Poisoned rows cannot leak secret-like values.

Source connector registration validates native scope, config arrays/numbers, actor and one Date clock sample before SQL. Supplied IDs cannot be silently normalized into collisions, and creation uses the validated timestamp.

Source ingestion validates one native actor before SQL and reuses it across record, batch and event audit writes. Failed-batch error codes must be native, bounded and secret-screened before persistence.

Registration conflict checks and ingestion validate the selected connector row before array comparison, record mapping or duplicate-batch lookup. Poisoned connector configuration fails with a controlled evidence error.

Inside ingestion transactions, existing and newly mutated business-record IDs/versions are validated before sync-item, batch or event writes. Poisoned mutation results roll back the entire unit.

Failed source-batch insertion and the connector `ERROR` transition execute in one transaction. A connector update failure rolls back the failed batch instead of leaving contradictory audit and state evidence.

Concurrent success-batch idempotency conflicts roll back speculative record work and re-read the winning batch only for the exact named batch constraint. Other uniqueness errors remain failures.

Failed-batch creation applies the same exact-constraint recovery after rollback, so concurrent invalid deliveries converge on one durable failure without double connector transitions.

Initial, inserted and concurrency-winner batches must match the selected connector and application before projection. An unexpected row cannot be returned merely because an idempotency lookup produced it.

Connector and batch list projections verify every returned row still matches the requested tenant scope or connector despite the SQL predicate. Inconsistent proxy or database evidence fails closed.

Successful and failed ingestion transitions update a connector only while it remains non-`REVOKED`, with exact-ID return evidence required. Concurrent revocation rolls back the transaction instead of reactivating the connector.

Batch projection enforces status-specific count invariants: applied rows have zero errors with `received = applied + unchanged`; failed rows carry errors and no applied/unchanged records.

Failed-batch hashing uses only prevalidated idempotency, evidence, cursor and record identity fields. Invalid bodies are not stringified, so getters, `toJSON` hooks or cycles cannot execute after SQL begins.

The reference read-only Business Source adapter requires JSON media types, validates declared size, streams under a 5 MB actual-byte ceiling and applies its wall timeout through body consumption. Abort-ignoring bodies cannot hang sync.

Business Source credential-reference controls are native and bounded. Resolution receives an AbortSignal under an independent 100–5,000 ms deadline, and returned base URL/token values require native bounded shapes before HTTP.

The read adapter cancels non-2xx, non-JSON and invalid/oversized declared response streams before returning controlled errors, releasing HTTP resources without consuming untrusted bodies.

Business Source pagination requires a native date cursor, object payload, items no larger than configured page size and an integer total bounded to 1,000,000. String totals and oversized pages fail closed.

Source work-order mapping accepts only JSON scalar fields and native string/number/Date timestamps. Arrays and coercion-capable objects cannot become IDs, titles, SLA values or evidence times.

The privacy-minimized mapped work-order projection is screened for common token, Bearer, JWT, PEM and key/value credential shapes before source ingestion.

Operators can run `pnpm growth-migrations:status`. The command uses the guarded `BUSINESS_DATABASE_URL` resolver, denies remote databases unless the existing explicit allow flag is set, performs only the ledger SELECT and exits 2 for PENDING/BLOCKED or 1 for configuration/query errors. It never migrates.

The command JSON contract is `schemaVersion: 1` and includes explicit read-only/no-DDL/no-apply/no-credential safety facts for CI consumers. Use `pnpm --silent growth-migrations:status` for JSON-only stdout. These facts describe command behavior only and are not an activation or deployment authorization.

ERROR output uses the same versioned safety envelope. Only bounded uppercase error codes are retained; arbitrary exception/database text is replaced with `GROWTH_MIGRATION_STATUS_FAILED` to avoid operator-log leakage.

Connector health probes now validate all control inputs and the observation clock before authorization, database reads or external calls. Probe adapters receive an `AbortSignal`; the service enforces a configurable 100–30,000 ms timeout (10 seconds by default) and records a sanitized `UNHEALTHY` result on timeout. This remains read-only at the external connector and does not activate a binding or Runtime.

Website webhook header normalization is now bounded independently of the HTTP server: at most 64 headers, 64-character token names and 8 KiB string values, with arrays and CR/LF/NUL rejected before secret resolution. Both plain objects and the standard `Headers` interface are supported.

Official API allowlists are bounded to 1–50 unique explicit hostname strings. Wildcards, malformed names, duplicates and non-string coercion are rejected at adapter construction, before credential resolution or network access.

Official publishing and business API writes set `redirect: error`, so a credential-bearing request cannot follow an allowlisted endpoint to another host. Native/custom fetch failures and denied redirects surface only sanitized retryable `*_NETWORK_FAILED` codes.

The shared bounded JSON reader actively cancels response bodies when media type or declared length is rejected, in addition to cancelling streams that cross the byte limit during reading. Rejected official API responses do not leave unread network streams behind.

Successful official API JSON must be a plain object. Authoritative external IDs and statuses must be native bounded safe strings; null/array roots and numeric or boolean coercion fail as non-retryable protocol errors.

Official outbound work validates operation, approval, asset, lead and bounded payload controls before credential resolution. Unsafe or oversized request data cannot cause a vault/secret-provider lookup or network call.

Delivery ledger controls no longer coerce IDs, capabilities, actors, authoritative references or CAS versions. Native bounded strings and positive integer versions are required before authorization or SQL.

Delivery dashboard/audit limits require native positive integers and are capped at 100/500. Dashboard clock validation and its single generated-at sample occur before either read query.

Identity review list/audit controls require native positive integer limits (capped at 100/500), a known status and bounded native references/versions before authorization or SQL.

Connector binding controls no longer coerce IDs, endpoint hosts, credential refs, versions, health windows, audit limits or probe timeouts. Invalid native types fail before authorization, SQL or external probe calls.

Connector activation controls likewise require native references, actors, positive integer CAS versions/window settings and list limits. Invalid inputs fail before access authorization or SQL; list preflights cap at 100.

Production feature flag controls require native bounded keys/actors, positive integer CAS versions and integer authorization windows before production authorization, SQL or pool connection acquisition.

Growth tenant source-readiness requires native bounded organization/workspace/tenant/application IDs and a positive integer limit before SQL. Limits cap at 100; invalid clocks still fail closed.

Runtime evidence credential-reference and health probes are bounded to 5 seconds by default (100–30,000 ms accepted) and receive an AbortSignal. Timeout is a blocker. Safety metadata counts performed read-only external probes and separately guarantees no external writes, approval consumption or Runtime start.

Read `ANKSEN_AI_GROWTH_PLATFORM_PLAN.md`, `CLOSED_LOOP_ACCEPTANCE.md`, `IMPLEMENTATION_QUEUE.md`, and `packages/growth-core/README.md`, inspect the first failing or unproven acceptance criterion, and continue from there without restarting product discovery.
