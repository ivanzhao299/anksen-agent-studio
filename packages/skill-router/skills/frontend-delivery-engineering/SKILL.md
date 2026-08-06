---
name: frontend-delivery-engineering
description: "Deliver or repair production frontend work end to end: convert requirements or existing code into a design-ready structure, implement or review React/Next.js interfaces, translate authorized Figma designs, audit Web UI quality and accessibility, create Playwright E2E tests, operate a real browser for visual verification, diagnose GitHub Actions CI failures, and address PR review comments through verified closure. Use for frontend product delivery, UI reconstruction, Figma-to-code or code-to-design preparation, React architecture, browser smoke tests, E2E regression, CI repair, PR review response, accessibility audits, and requests that require evidence beyond merely writing a page."
---

# Frontend Delivery Engineering

Deliver a verified product surface, not an isolated code patch. Reuse the repository's design system, test stack, CI, and existing platform workflow. Never claim Figma, browser, CI, deployment, or review completion without corresponding tool evidence.

## Workflow

1. Inspect repository instructions, product goal, target users, route scope, stack, existing components, design tokens, test tooling, CI, and acceptance criteria.
2. Classify the task into the modules in [references/modules.md](references/modules.md). Combine only the modules needed.
3. Establish a compact contract:
   - user journey and primary outcome;
   - information hierarchy and responsive behavior;
   - implementation boundaries and reusable components;
   - validation matrix and release boundary.
4. For visual work, invoke or follow frontend-product-design before implementation. Reject generic card-grid composition and preserve authorized brand identity.
5. Implement with clear React/Next.js boundaries, explicit data/state ownership, semantic HTML, accessible interactions, stable loading/error/empty states, and project-native tokens.
6. Verify in increasing cost order: focused tests, lint/typecheck, production build, Playwright/browser journey, visual desktop/mobile inspection, then CI.
7. If CI fails, read the failing job and smallest relevant log, classify the failure, reproduce when practical, fix the root cause, and rerun the failed and dependent gates.
8. If PR comments exist, classify every unresolved comment as code change, explanation, question, stale, or out of scope. Link each change to evidence and resolve only after verification.
9. Apply [references/delivery-gates.md](references/delivery-gates.md). Stop with HOLD when credentials, target environments, required tools, or approval are missing.

## Non-negotiable Rules

- Do not create a parallel design system, state machine, test harness, CI pipeline, or deployment path when the project already has one.
- Do not translate screenshots or Figma nodes blindly; preserve hierarchy, component semantics, responsive intent, and real content behavior.
- Do not use browser screenshots as the sole test. Assert outcomes, state transitions, navigation, errors, and persisted effects.
- Do not weaken tests, lint, types, accessibility, branch protection, or production gates merely to make CI green.
- Do not mark a review comment resolved without a response or evidence-backed disposition.
- Do not expose secrets, session tokens, private Figma data, CI variables, or authenticated page content in artifacts.
- Treat deployment and external writes as separately authorized actions.

## Required Delivery Evidence

Report:

- selected modules and delivery contract;
- changed files and reused components/tokens;
- test, typecheck, build, browser/E2E, CI, and review results that actually ran;
- desktop/mobile and accessibility evidence for UI work;
- remaining limitations, skipped checks, and any HOLD reason.

Read [references/modules.md](references/modules.md) for module-specific procedures and [references/delivery-gates.md](references/delivery-gates.md) before final delivery.
