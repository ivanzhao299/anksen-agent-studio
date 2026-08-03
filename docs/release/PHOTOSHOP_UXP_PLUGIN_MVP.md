# Photoshop UXP Plugin MVP

## Outcome

ANKSEN Agent Studio now contains a governed Photoshop UXP execution endpoint for `640 × 1440 mm` floor-standing exhibition graphics. The panel retains the approved single-poster contract; the production package additionally includes a twelve-panel Photoshop series executor and a versioned production manifest.

The plugin is implemented in `packages/photoshop-uxp-plugin`. It supports:

- Manifest v5 Photoshop panel
- Photoshop 24.4+ host declaration
- local JSON job import
- bundled Jinhu logo
- fixed 640 × 1440 mm template contract
- 150, 200, or 300 DPI rendering
- RGB or CMYK document creation
- editable text layers
- named brand and copy layer groups
- Photoshop modal execution and one history operation
- explicit human confirmation before document writes
- PSD save dialog and PNG/JPG preview export primitives
- strict operation allowlist
- external file access through UXP file pickers
- a fail-closed Studio client boundary
- deterministic Node tests for protocol, layout, executor and governance behavior
- a Photoshop-native twelve-panel production script with smart-object visuals, editable typography, CMYK PSD/PDF output and 4K previews
- a reviewed Jinhu twelve-panel reference series under `design-assets/jinhu-12-panel-series`

## Control-plane integration

`photoshop-uxp` is registered in the existing Runtime Adapter Marketplace. It is not a new runtime scheduler, queue, worker or state machine.

Properties:

- provider: `adobe`
- invoke mode: `browser`
- risk: `HIGH`
- max parallel tasks: `1`
- default health: `disabled`
- Governance Center outcome: `PROPOSAL_ONLY`

The adapter requires the existing Studio proposal approval and Runtime Activation Gate. `packages/runtime-adapters/lib/photoshop-uxp-utils.mjs` evaluates:

- exact job-bound proposal approval
- Photoshop node health
- loaded UXP plugin
- interactive user session
- explicit human-confirmed execution mode
- production and deployment disabled
- absence of credential values
- required adapter guardrails

The result can be `BLOCKED` or `READY_FOR_INTERACTIVE_CONFIRMATION`; it never returns an autonomous-execution state.

## Default security posture

The default plugin Manifest requests local file-picker access only. It does not request network access.

`manifest.connected.example.json` is deliberately not the default. A connected build requires an approved HTTPS Studio domain and a separate plugin ID. The runtime registry remains disabled until governance gates and node health are verified.

## Validation

Run:

```bash
pnpm photoshop:uxp:test
pnpm photoshop:uxp:build
pnpm typecheck
node packages/orchestrator-core/bin/studio.mjs adapter invoke-plan --runtime photoshop-uxp --skill poster_generation --dry-run
```

Expected:

- plugin tests pass
- plugin build reports `ready_for_uxp_developer_tool_packaging`
- workspace typecheck passes
- adapter invoke plan reports `PROPOSAL_ONLY`
- no model, external service, credential value, deploy or production action is invoked

## Machine-local acceptance completed

The plugin was loaded successfully in licensed Photoshop 2026 v27.9 with UXP 9.3 after enabling Photoshop Developer Mode and restarting both applications. The built-in governed sample completed real host execution.

Verified outputs:

- editable PSD: `/Users/mac/Documents/jinhu-science-innovation-park.psd`
- PNG preview: `/Users/mac/Documents/jinhu-science-innovation-park-preview.png`
- dimensions: `3780 × 8504 px` at 150 ppi, corresponding to `640 × 1440 mm`
- real layers: brand group, placed Jinhu logo, editable copy group, gradient background and base background
- panel log: PSD generation and PNG export completed
- installable CCX: `packages/photoshop-uxp-plugin/release/com.anksen.studio.photoshop_PS.ccx`

Photoshop 27.9 compatibility findings are now encoded in the executor: `suspendHistory` is optional for a newly created document while `executeAsModal` remains mandatory, and `AnchorPosition` is read from module-level Photoshop constants.

The twelve-panel production executor was also run in licensed Photoshop 2026. Final acceptance verified 12 editable CMYK PSD files at `3780 × 8504 px`, 12 single-page print PDFs at `640 × 1440 mm`, 12 RGB 4K previews, real PingFang text layers at 100% horizontal/vertical scale, and the semantic layer groups documented in the production manifest. These design artifacts are reference and reproduction inputs; deploying Studio does not remotely activate Photoshop or bypass the interactive approval boundary.

Run `pnpm --dir packages/photoshop-uxp-plugin verify:artifacts -- <psd> <png>` for deterministic filesystem-level acceptance. Run `pnpm --filter @anksen-agent-studio/photoshop-uxp-plugin package:ccx` for repeatable CCX generation and archive verification; the same `dist/manifest.json` can also be packaged through UXP Developer Tool 2.2.1.

Studio deployment may distribute this disabled-by-default adapter and plugin package. It does not activate a real Photoshop Runtime, start Photoshop remotely, or permit unattended document writes; those actions remain behind the existing activation and interactive approval gates.
