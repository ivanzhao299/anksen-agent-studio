# Frontend Delivery Gates

Reject completion when a required critical gate fails.

## Product and design

- Primary user, journey, page purpose, current state, and primary action are explicit.
- Layout hierarchy is carried by composition, typography, spacing, and content rather than decorative cards or effects.
- Existing tokens/components are reused; deviations are justified.
- Desktop and narrow mobile behavior are defined and inspected.

## Engineering

- Component, state, data-fetching, server/client, and error boundaries are understandable.
- Loading, empty, error, disabled, focus, success, permission, overflow, and long-content states are handled where applicable.
- No new duplicate framework, router, state system, design system, test harness, or release path was introduced.

## Accessibility and interaction

- Semantic landmarks and heading order are coherent.
- Forms have labels; icon controls have accessible names.
- Keyboard path, visible focus, contrast, touch targets, reduced motion, and state announcements are acceptable.
- Destructive and irreversible actions communicate consequence and confirmation.

## Verification

- Focused tests and project-required lint/type/build gates pass.
- Critical journey has browser or Playwright evidence when a runnable UI exists.
- Browser console and failed network requests are reviewed for representative routes.
- Visual evidence covers desktop and near-390px mobile widths.
- CI required checks pass when the task includes a pushed PR or CI repair.
- Every in-scope PR comment has a verified disposition when review closure is requested.

## Evidence integrity

- Report commands, check URLs or IDs, routes, viewport sizes, and observed outcomes.
- Separate executed checks from recommendations.
- Redact credentials and sensitive authenticated content.
- Use HOLD for unavailable tools, missing access, unapproved external writes, unstable environments, or failed required gates.
