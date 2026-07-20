# New Codex Window Startup

First command:

```bash
node packages/orchestrator-core/bin/studio.mjs context summary
```

## Active Program

Continue **Enterprise Application Foundation and Intelligent Workflow Integration**. Read `docs/ENTERPRISE_APPLICATION_INTELLIGENCE_ARCHITECTURE.md` before planning or implementation.

The cockpit is only the cross-system command and observation entry. Business capability belongs in independent conventional applications. Business records are authoritative; Tasks, Agents, Runners, and Runtime Memory drive those records through the shared Kernel.

## Next Implementation Order

1. Domain-specific business record detail and forms for Strategy, HR, Finance, Sales, Manufacturing, and Smart Park.
2. Shared My Work actions, approval, notification, and failed-work recovery.
3. PostgreSQL business-object relation and scoped Runtime Memory migrations.
4. One validated write-back workflow per application.
5. Source-backed business outcome aggregation in the cockpit.

## Safety

- Do not create a second Planner, Scheduler, Worker, Runtime, or business database inside the cockpit.
- Do not replace business records with Agent tasks.
- Do not directly deploy or open interactive production access. Use only the explicitly authorized Office 204 release workflow.
- Do not expose credential values or run destructive production operations.
