# Business Outcome Connectors MVP

## Outcome

Studio now separates execution progress from business outcomes. The Autonomous Kernel remains the source of Goal and Task progress. Business Outcome Connectors supply source-backed KPI snapshots for the eight independent business applications. A completed Campaign never implies that revenue, headcount, cash, production or park outcomes changed.

## Implementation plan and result

| ID | Deliverable | Dependency | Result |
| --- | --- | --- | --- |
| BO-001 | Audit portfolio placeholders and application boundaries | — | Fixed `AWAITING_SOURCE` placeholder identified |
| BO-010 | Define application-owned KPI contracts | BO-001 | Eight contracts, three core metrics each |
| BO-020 | Connector registry and Credential Reference boundary | BO-010 | Manual, API snapshot, SQL read model and webhook types |
| BO-030 | Idempotent snapshot ingestion and evidence audit | BO-020 | Deterministic snapshot IDs and hashed evidence audit |
| BO-040 | Coverage, range, freshness and secret-risk validation | BO-030 | PASS, WARN, STALE and rejection rules |
| BO-050 | Portfolio dashboard integration | BO-040 | Source-backed result status and primary KPI on home cards |
| BO-060 | Outcome Center product page and lifecycle API | BO-050 | Register, ingest, inspect and refresh workflows |
| BO-070 | Focused safety, quality and UI tests | BO-060 | Automated verification |

Shortest path: BO-001 → BO-010 → BO-020 → BO-030 → BO-040 → BO-050 → BO-060 → BO-070.

## Application contracts

- Software Factory: delivery success rate, lead time, escaped defects.
- Video Factory: completed assets, approval pass rate, publish-ready assets.
- Enterprise Strategy: objective completion, KPI on-track rate, overdue initiatives.
- Human Resources: active headcount, critical-role fill rate, regrettable attrition.
- Finance: budget variance, cash balance, overdue receivables.
- AI Growth & Sales: qualified leads, lead-to-order rate, attributed revenue.
- Intelligent Manufacturing ERP: plan attainment, first-pass yield, inventory turnover.
- Smart Park: occupancy, collection rate, open safety findings.

These are control-plane contracts, not substitute ledgers. Owning systems retain transaction and master-data ownership.

## Trust and quality states

- `AWAITING_CONNECTOR`: no configured source.
- `AWAITING_SOURCE`: connector exists but no snapshot was accepted.
- `VERIFIED`: full metric coverage and fresh source evidence.
- `QUALITY_WARNING`: accepted but incomplete coverage.
- `STALE`: latest observation exceeds the connector freshness policy.

Every snapshot requires an idempotency key, observation timestamp and evidence reference. Percentages, negative non-negative measures, duplicate metric IDs, future observations and secret-like evidence references are rejected. Audit events retain a hash of the evidence reference rather than credentials.

## API

- `GET /api/outcomes/catalog`
- `GET /api/outcomes/dashboard`
- `POST /api/outcomes/connectors`
- `POST /api/outcomes/snapshots`

## Safety boundary

The MVP does not poll or mutate production systems. Non-manual connectors require a Credential Reference but never a secret value. The API receives normalized snapshots from an authorized integration or signed manual process. Production connector workers, network allowlists, schema-specific adapters and source signatures remain future activation gates.

## Next phase

Implement the first source-specific read-only adapters in this order: Smart Park operating snapshot, Studio software-delivery metrics, then Group Strategy KPI exchange. Each adapter needs a fixture contract, source signature or checksum, replay test, freshness SLO and explicit production activation approval.
