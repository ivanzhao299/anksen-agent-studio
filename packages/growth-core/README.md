# @anksen/growth-core

Reusable, tenant-neutral domain core for ANKSEN AI Growth Platform.

## Scope

Owns domain contracts and pure policies for:
- tenant/brand/market/ICP configuration
- prospect/lead/customer identity graph
- signals and explainable scoring
- qualification
- opportunities and commercial references
- attribution primitives
- next-best-action/recommendation contracts

## Non-goals

This package must not:
- contain KingTurf-specific logic or vocabulary
- call social/network APIs directly
- store channel credentials
- create a second scheduler/runtime/approval/audit stack
- own downstream CRM/ERP/RFQ/order source-of-truth records

## Dependency rule

`growth-core` may define stable interfaces consumed by connectors, agents, analytics and tenant packs. Channel-specific behavior lives in `growth-connectors`; business-system mapping lives in `growth-integrations`; industry rules live in tenant packs.

## Initial GA sequence

GA-001 will add typed schemas and validation here. GA-005/006/015 will progressively add identity, scoring and attribution engines behind stable contracts.
