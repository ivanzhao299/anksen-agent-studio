# Capability Modules

## 1. Frontend product design

Use for landing pages, dashboards, workstations, mobile apps, redesigns, and visual polish. Define experience thesis, visual thesis, hierarchy, page model, responsive rules, interaction states, and visual QA before declaring implementation complete.

## 2. Figma design implementation

Use only with authorized Figma access or exported design evidence.

1. Read pages, frames, nodes, variables, components, typography, constraints, and responsive variants.
2. Map Figma components and tokens to existing project primitives.
3. Implement semantic structure and real states rather than absolute-position tracing.
4. Compare representative desktop/mobile renders with the design and document intentional deviations.

If Figma tooling or source access is unavailable, produce a mapping plan and HOLD; never imply pixel verification occurred.

## 3. Web design quality review

Audit information hierarchy, semantics, keyboard/focus behavior, labels and accessible names, contrast, touch targets, overflow, responsive layout, reduced motion, error feedback, and content clarity. Return severity, location, user impact, fix, and verification for each finding.

## 4. React and Next.js engineering

- Keep server/client boundaries intentional.
- Keep data access outside presentational components.
- Assign one owner for server state, local UI state, form state, and URL state.
- Prefer composition and feature boundaries over giant page components.
- Avoid effect-driven derived state, unstable keys, unnecessary client rendering, duplicated fetches, and premature memoization.
- Validate loading, error, empty, permission, long-content, and narrow-screen behavior.

## 5. Playwright E2E

1. Identify a high-value user journey and deterministic preconditions.
2. Prefer role, label, and test-id locators over brittle CSS.
3. Assert user-visible outcomes and persisted effects; avoid arbitrary sleeps.
4. Capture trace, screenshot, console, and network evidence on failure without leaking secrets.
5. Make cleanup and test data isolation explicit.

Cover authentication, critical forms, payment or approval boundaries, admin flows, and regressions when relevant.

## 6. Real-browser operation

Use the available browser runtime to open the actual target, click, type, navigate, inspect console-visible state, and capture desktop/mobile evidence. Do not perform destructive or production writes without authorization. If browser tooling is absent, run repository browser automation if available or return HOLD.

## 7. GitHub Actions CI repair

1. Inspect check status, failing job, annotations, and the smallest useful log.
2. Classify as code, test, lint/type, build, dependency, environment, workflow, flaky, or deployment failure.
3. Determine first causal error, not the final cascade.
4. Reproduce locally when practical and fix the root cause.
5. Rerun focused checks, then the complete required gate set.
6. Keep a failure → cause → change → proof record.

Never modify a gate merely to hide a real failure.

## 8. PR review comment closure

Read the current PR, diff, unresolved threads, and surrounding code. Group duplicate comments. For each thread, implement and verify, explain with evidence, ask a precise question, or explicitly decline with scope/risk reasoning. Reply concisely and resolve only when the concern is actually closed.

## 9. Requirement/code to design structure

Use when a team needs a discussable design artifact before implementation. Convert requirements or code into:

- page and route inventory;
- user journeys;
- content hierarchy;
- layout regions and responsive variants;
- component/state inventory;
- design tokens and reuse map;
- annotations for interactions and edge cases.

Generate or modify a Figma artifact only when an authorized Figma tool is available. Otherwise deliver a structured design specification suitable for later Figma generation and mark the external artifact as pending.
