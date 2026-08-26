import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  ensurePostgresFixture,
  createTestPool,
} from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { createBusinessApplicationRuntime } from "../lib/business-database.mjs";
import { migrateGrowthPlatform } from "../lib/growth-database.mjs";
import {
  PostgresGrowthConnectorBindingStore,
  GrowthConnectorHealthProbeService,
} from "../lib/postgres-growth-connector-binding-store.mjs";
import {
  GrowthConnectorActivationGate,
  summarizeGrowthActivationPreflights,
} from "../lib/growth-connector-activation-gate.mjs";
import { evaluateConsoleActionAccess } from "../../access-center/lib/access-center-utils.mjs";

const accessPolicy = JSON.parse(
  await readFile(
    new URL(
      "../../access-center/examples/access-policy.example.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("activation authorization coverage requires every governed connector kind", () => {
  const ready = (kind) => ({ status: "READY", binding: { kind } }),
    complete = summarizeGrowthActivationPreflights([
      ready("WEBSITE_INBOUND"),
      ready("PUBLISHING"),
      ready("BUSINESS_HANDOFF"),
      ready("PUBLISHING"),
    ]),
    incomplete = summarizeGrowthActivationPreflights([
      ready("WEBSITE_INBOUND"),
      { status: "BLOCKED", binding: { kind: "PUBLISHING" } },
      ready("BUSINESS_HANDOFF"),
    ]);
  assert.equal(complete.productionAuthorizationCovered, true);
  assert.deepEqual(complete.readyKinds, [
    "BUSINESS_HANDOFF",
    "PUBLISHING",
    "WEBSITE_INBOUND",
  ]);
  assert.equal(incomplete.productionAuthorizationCovered, false);
});

test("activation Gate rejects future connector health evidence", () => {
  const gate = new GrowthConnectorActivationGate({
      pool: { connect() {} },
      clock: () => new Date("2026-08-26T10:00:00Z"),
    }),
    result = gate.evaluate(
      { organizationId: "org", workspaceId: "growth", tenantId: "tenant" },
      {
        activation: {
          id: "activation",
          version: 1,
          status: "APPROVED",
          approval_proven: true,
          fields: {
            tenantId: "tenant",
            bindingVersion: 1,
            connectorKind: "WEBSITE_INBOUND",
            explicitAuthorizationRef: "PROD-AUTH-001",
            expiresAt: "2026-08-27T10:00:00Z",
          },
        },
        binding: {
          id: "binding",
          kind: "WEBSITE_INBOUND",
          version: 1,
          enabled: false,
          health_status: "HEALTHY",
          health_observed_at: new Date("2026-08-26T10:01:00Z"),
        },
      },
      1,
    );
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.reasons.includes("CONNECTOR_HEALTH_NOT_FRESH"));
});

test("activation authorization expires at the exact boundary", () => {
  const gate = new GrowthConnectorActivationGate({
      pool: { connect() {} },
      clock: () => new Date("2026-08-27T10:00:00Z"),
    }),
    result = gate.evaluate(
      { organizationId: "org", workspaceId: "growth", tenantId: "tenant" },
      {
        activation: {
          id: "activation",
          version: 1,
          status: "APPROVED",
          approval_proven: true,
          fields: {
            tenantId: "tenant",
            bindingVersion: 1,
            connectorKind: "WEBSITE_INBOUND",
            explicitAuthorizationRef: "PROD-AUTH-001",
            expiresAt: "2026-08-27T10:00:00Z",
          },
        },
        binding: {
          id: "binding",
          kind: "WEBSITE_INBOUND",
          version: 1,
          enabled: false,
          health_status: "HEALTHY",
          health_observed_at: new Date("2026-08-27T09:59:00Z"),
        },
      },
      1,
    );
  assert.ok(result.reasons.includes("ACTIVATION_AUTHORIZATION_EXPIRED"));
});

test("activation Gate rejects unbounded authorization and invalid windows", () => {
  assert.throws(
    () =>
      new GrowthConnectorActivationGate({
        pool: { connect() {} },
        maxHealthAgeSeconds: 0,
      }),
    /positive maxHealthAgeSeconds/,
  );
  assert.throws(
    () =>
      new GrowthConnectorActivationGate({
        pool: { connect() {} },
        maxAuthorizationAgeSeconds: Number.NaN,
      }),
    /positive maxAuthorizationAgeSeconds/,
  );
  const gate = new GrowthConnectorActivationGate({
      pool: { connect() {} },
      clock: () => new Date("2026-08-26T10:00:00Z"),
      maxAuthorizationAgeSeconds: 60,
    }),
    result = gate.evaluate(
      { organizationId: "org", workspaceId: "growth", tenantId: "tenant" },
      {
        activation: {
          id: "activation",
          version: 1,
          status: "APPROVED",
          approval_proven: true,
          fields: {
            tenantId: "tenant",
            bindingVersion: 1,
            connectorKind: "WEBSITE_INBOUND",
            explicitAuthorizationRef: "PROD-AUTH-001",
            expiresAt: "2026-08-26T10:01:01Z",
          },
        },
        binding: {
          id: "binding",
          kind: "WEBSITE_INBOUND",
          version: 1,
          enabled: false,
          health_status: "HEALTHY",
          health_observed_at: new Date("2026-08-26T09:59:00Z"),
        },
      },
      1,
    );
  assert.ok(result.reasons.includes("ACTIVATION_AUTHORIZATION_WINDOW_EXCEEDED"));
});

test("connector activation consumes an existing business approval exactly once with no external call", async () => {
  await ensurePostgresFixture();
  const pool = createTestPool(),
    suffix = randomUUID(),
    scope = {
      organizationId: `activation-${suffix}`,
      workspaceId: "growth",
      tenantId: "tenant-a",
    },
    actor = {
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      userId: "growth-operator",
    },
    clock = () => new Date("2026-08-26T10:00:00Z");
  try {
    const runtime = await createBusinessApplicationRuntime({
      repoRoot: process.cwd(),
      pool,
    });
    await migrateGrowthPlatform(pool);
    const bindings = new PostgresGrowthConnectorBindingStore({ pool, clock, authorizeMutation: async () => true }),
      configured = await bindings.configure({
        scope,
        kind: "WEBSITE_INBOUND",
        adapterId: "website-health-v1",
        credentialReferenceId: "website-signing-ref",
        endpointHost: "kingturf.cn",
        actorId: "connector-admin",
      }),
      probe = new GrowthConnectorHealthProbeService({
        store: bindings,
        clock,
        authorizeProbe: async (input) => input.actorId === "health-probe",
        probes: {
          "website-health-v1": {
            mode: "READ_ONLY_HEALTH_PROBE",
            async probe() {
              return {
                status: "HEALTHY",
                evidenceRef: "probe://website/healthy",
              };
            },
          },
        },
      }),
      probed = await probe.probe({
        scope,
        id: configured.id,
        expectedVersion: configured.version,
        actorId: "health-probe",
      });
    assert.equal(probed.binding.enabled, false);
    const draft = await runtime.store.createRecord(
        "ai-growth-sales-platform",
        {
          objectType: "connector_activation",
          title: "Activate KingTurf website ingress",
          displayKey: `ACT-${suffix}`,
          fields: {
            tenantId: scope.tenantId,
            bindingId: configured.id,
            bindingVersion: probed.binding.version,
            connectorKind: "WEBSITE_INBOUND",
            expiresAt: "2026-08-27",
            activationReason: "Approved pilot ingress",
            explicitAuthorizationRef: "PROD-AUTH-001",
          },
        },
        actor,
      ),
      waiting = await runtime.store.transitionRecord(
        "ai-growth-sales-platform",
        draft.id,
        { expectedVersion: draft.version, status: "WAITING_APPROVAL" },
        actor,
      ),
      approval = await runtime.store.requestApproval(
        "ai-growth-sales-platform",
        draft.id,
        {
          expectedVersion: waiting.version,
          requestedStatus: "APPROVED",
          idempotencyKey: `activation-approval-${suffix}`,
        },
        actor,
      ),
      decision = await runtime.store.decideApproval(
        "ai-growth-sales-platform",
        approval.id,
        {
          decision: "APPROVED",
          comment: "Explicit production authorization fixture",
        },
        { ...actor, userId: "sales-reviewer" },
      );
    assert.equal(decision.record.status, "APPROVED");
    assert.equal(
      decision.record.availableTransitions.includes("CONSUMED"),
      false,
    );
    await assert.rejects(
      () =>
        runtime.store.transitionRecord(
          "ai-growth-sales-platform",
          draft.id,
          { expectedVersion: decision.record.version, status: "CONSUMED" },
          actor,
        ),
      (error) => error.code === "BUSINESS_RECORD_TRANSITION_DENIED",
    );
    const deniedGate = new GrowthConnectorActivationGate({ pool, clock });
    await pool.query(
      "UPDATE business_approval SET object_version=object_version+10 WHERE id=$1",
      [approval.id],
    );
    const staleApproval = await deniedGate.preflight({
      scope,
      activationId: draft.id,
      expectedActivationVersion: decision.record.version,
    });
    assert.ok(staleApproval.reasons.includes("ACTIVATION_APPROVAL_NOT_PROVEN"));
    await pool.query(
      "UPDATE business_approval SET object_version=$2 WHERE id=$1",
      [approval.id, waiting.version],
    );
    await pool.query(
      "UPDATE business_application_record SET fields=jsonb_set(fields,'{explicitAuthorizationRef}',to_jsonb($2::text)) WHERE id=$1",
      [draft.id, "sk-production-secret"],
    );
    const secretLikeAuthorization = await deniedGate.preflight({
      scope,
      activationId: draft.id,
      expectedActivationVersion: decision.record.version,
    });
    assert.ok(
      secretLikeAuthorization.reasons.includes(
        "EXPLICIT_PRODUCTION_AUTHORIZATION_INVALID",
      ),
    );
    await pool.query(
      "UPDATE business_application_record SET fields=jsonb_set(fields,'{explicitAuthorizationRef}',to_jsonb($2::text)) WHERE id=$1",
      [draft.id, "PROD-AUTH-001"],
    );
    await assert.rejects(
      () =>
        deniedGate.activate({
          scope,
          activationId: draft.id,
          expectedActivationVersion: decision.record.version,
          actorId: "unprivileged",
        }),
      (error) => error.code === "GROWTH_CONNECTOR_ACTIVATION_ACCESS_DENIED",
    );
    const productionRole = accessPolicy.roles.find(
        (item) => item.role_id === "growth_production_operator",
      ),
      productionContext = {
        authenticated: true,
        user: { username: "growth-production-operator" },
        capabilities: productionRole.capabilities,
        direct_execute_max_risk: productionRole.direct_execute_max_risk,
        project_allowlist: ["*"],
        plan: null,
      },
      authorize = async (input) =>
        input.actorId === "growth-production-operator" &&
        (
          await evaluateConsoleActionAccess(
            { policy: accessPolicy },
            { action_id: input.actionId, risk: "CRITICAL" },
            { user_context: productionContext },
          )
        ).status === "ALLOW",
      roleOnlyGate = new GrowthConnectorActivationGate({
        pool,
        clock,
        authorize,
      });
    await assert.rejects(
      () =>
        roleOnlyGate.activate({
          scope,
          activationId: draft.id,
          expectedActivationVersion: decision.record.version,
          actorId: "growth-production-operator",
        }),
      (error) =>
        error.code === "GROWTH_CONNECTOR_PRODUCTION_OPERATION_NOT_AUTHORIZED",
    );
    const gate = new GrowthConnectorActivationGate({
        pool,
        clock,
        authorize,
        authorizeProductionOperation: async (input) =>
          input.actorId === "growth-production-operator" &&
          (input.authorizationRef === "PROD-AUTH-001" ||
            (input.operation === "GROWTH_CONNECTOR_DISABLE" &&
              input.incidentRef === "INC-GROWTH-001")),
      }),
      preflight = await gate.preflight({
        scope,
        activationId: draft.id,
        expectedActivationVersion: decision.record.version,
      });
    assert.deepEqual(preflight.reasons, []);
    assert.equal(preflight.status, "READY");
    assert.equal(preflight.safety.connectorEnabled, false);
    const listing = await gate.listPreflights({ scope });
    assert.deepEqual(listing.summary, {
      total: 1,
      ready: 1,
      blocked: 0,
      readyKinds: ["WEBSITE_INBOUND"],
      requiredKinds: ["WEBSITE_INBOUND", "PUBLISHING", "BUSINESS_HANDOFF"],
      productionAuthorizationCovered: false,
    });
    assert.deepEqual(listing.safety, {
      credentialValuesRead: false,
      externalCallsPerformed: false,
      connectorEnabled: false,
    });
    assert.doesNotMatch(
      JSON.stringify(listing),
      /PROD-AUTH|website-signing-ref|probe:\/\//,
    );
    const activated = await gate.activate({
      scope,
      activationId: draft.id,
      expectedActivationVersion: decision.record.version,
      actorId: "growth-production-operator",
    });
    assert.equal(activated.status, "ACTIVATED");
    assert.equal(activated.binding.enabled, true);
    assert.deepEqual(activated.safety, {
      credentialValuesRead: false,
      externalCallsPerformed: false,
    });
    await assert.rejects(
      () =>
        gate.activate({
          scope,
          activationId: draft.id,
          expectedActivationVersion: decision.record.version,
          actorId: "growth-production-operator",
        }),
      (error) =>
        error.code === "GROWTH_CONNECTOR_ACTIVATION_BLOCKED" &&
        error.preflight.reasons.includes("ACTIVATION_REQUEST_NOT_APPROVED"),
    );
    const disabled = await gate.disable({
      scope,
      bindingId: activated.binding.id,
      expectedBindingVersion: activated.binding.version,
      incidentRef: "INC-GROWTH-001",
      reason: "Emergency rollback after governed activation test",
      actorId: "growth-production-operator",
    });
    assert.equal(disabled.status, "DISABLED");
    assert.equal(disabled.binding.enabled, false);
    assert.deepEqual(disabled.safety, {
      credentialValuesRead: false,
      externalCallsPerformed: false,
    });
    await assert.rejects(
      () =>
        gate.disable({
          scope,
          bindingId: activated.binding.id,
          expectedBindingVersion: activated.binding.version,
          incidentRef: "INC-GROWTH-001",
          reason: "Emergency rollback replay attempt",
          actorId: "growth-production-operator",
        }),
      (error) =>
        error.code === "GROWTH_CONNECTOR_DISABLE_VERSION_OR_STATE_CONFLICT",
    );
    const events = (
        await pool.query(
          `SELECT event_type,payload FROM business_application_event WHERE object_id=$1 ORDER BY created_at`,
          [draft.id],
        )
      ).rows,
      bindingEvents = (
        await pool.query(
          `SELECT event_type,payload FROM growth_connector_binding_event WHERE binding_id=$1 ORDER BY sequence_id`,
          [activated.binding.id],
        )
      ).rows;
    assert.ok(
      events.some(
        (item) => item.event_type === "growth.connector.activation.consumed",
      ),
    );
    assert.ok(
      bindingEvents.some(
        (item) =>
          item.event_type === "CONNECTOR_BINDING_EMERGENCY_DISABLED" &&
          item.payload.incidentRef === "INC-GROWTH-001" &&
          /^[a-f0-9]{64}$/.test(item.payload.reasonHash),
      ),
    );
    assert.doesNotMatch(
      JSON.stringify(activated) +
        JSON.stringify(disabled) +
        JSON.stringify(events) +
        JSON.stringify(bindingEvents),
      /website-signing-ref|probe:\/\/|Emergency rollback after/,
    );
  } finally {
    await pool
      .query(
        "DELETE FROM business_application_record WHERE organization_id=$1",
        [scope.organizationId],
      )
      .catch(() => {});
    await pool
      .query("DELETE FROM growth_connector_binding WHERE organization_id=$1", [
        scope.organizationId,
      ])
      .catch(() => {});
    await pool.end();
  }
});
