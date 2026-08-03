# Photoshop Plugin V2 UI Audit

Audit date: 2026-08-03

## Audit health score

| # | Dimension | Score | Key finding |
|---|---|---:|---|
| 1 | Accessibility | 4/4 | Semantic tabs/panels, roving tab focus, Home/End/arrow navigation, keyboard layer tree, busy state and live error reporting are present. |
| 2 | Performance | 4/4 | No framework, gradients, blur effects, image-heavy UI or unbounded animation; updates use bounded DOM operations. |
| 3 | Responsive design | 3/4 | Fluid from the declared 230px host minimum; controls wrap and the 840px host capture is clean. Extremely narrow host panels intentionally collapse the context strip. |
| 4 | Theming | 4/4 | Photoshop host foreground/background variables are used with a small, coherent fallback token system. |
| 5 | Implementation integrity | 4/4 | The interface is specific to governed Photoshop production; the scoped detector run on HTML/CSS/JS returned no findings. |
| **Total** |  | **19/20** | **Excellent - minor host-specific polish only** |

## Implementation integrity verdict

Pass. The product model is coherent: Task, Layers, Operations, Review and Export represent the actual controlled Photoshop workflow. The interface does not imitate a marketing dashboard, does not invent a second orchestration state machine and does not expose arbitrary script or BatchPlay entry points.

## Executive summary

- P0: 0
- P1: 0
- P2: 0 open deterministic implementation issues in the audited V2 scope.
- P3: 1 operational limitation - the browser preview cannot execute UXP `require`, so capability behavior must continue to be validated in Photoshop rather than inferred from that preview.
- Scoped detector result for `index.html`, `styles.css` and `index.js`: `[]`.

## Positive findings

- One accent color, restrained surfaces and clear Photoshop-native density.
- Non-color status labels, error/empty/loading/blocked states and explicit approval copy.
- User-selected file entries, single-history execution and fail-closed Adapter behavior.
- Technical preflight is explicitly separated from human visual judgment.

## Independent review remediation

The finish review initially found five P1 and three P2 gaps. They were fixed before release:

- Export operations now require a live passing preflight inside the modal operation plan; BLOCKER prevents file writes and rolls back the suspended history.
- Human confirmation is bound to the normalized job SHA-256 and active Photoshop document ID. Loading another task or switching documents invalidates it.
- Local JSON import is review-only. Studio execution requires Studio-issued approval provenance; the default Adapter remains disabled.
- Artifact manifests require a completed result, passing preflight, non-empty artifacts and bound human approval. HIGH preflight findings additionally require a second confirmation bound to the exact report hash; that hash covers the complete issue evidence and fix metadata, and the Adapter independently recomputes it from the manifest.
- SAVE/EXPORT operations must form the terminal suffix of every V2 plan at both DSL and Adapter boundaries. The direct PNG action is Legacy-only, requires completed execution and removes a newly written file if final manifest generation fails.
- Per-operation `timeoutMs` is rejected rather than represented as interruptible: Photoshop host writes cannot be safely cancelled after they enter the host API.
- The plugin no longer persists a local idempotency ledger. Future resume keys must come from the existing Studio state boundary.
- Physical millimetre dimensions are converted to expected pixels during preflight. Requested bleed without verifiable metadata is a BLOCKER.
- The default Bridge replay guard persists across verifications and verifies the actual payload hash.
- Unsupported Smart Object fit/transform semantics and V2 document creation now fail validation instead of silently pretending support. Duplicate layer names fail closed.
- Tabs, layer tree, busy state and error announcements were hardened for keyboard and assistive technology use.

## Release note

The remaining work for a future release is live secure-bridge integration through existing governance gates, not UI polish or autonomous execution. The current exact-size roll-up proof uses 0mm bleed; any printer-specific bleed must be added only from an approved TrimBox/BleedBox specification.
