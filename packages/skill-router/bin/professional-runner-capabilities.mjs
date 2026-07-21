#!/usr/bin/env node
import { ProfessionalRunnerCapabilityRegistry } from "../lib/professional-runner-capabilities.mjs";

const requiredSkill = process.argv.includes("--require-ready") ? process.argv[process.argv.indexOf("--require-ready") + 1] : null;
const credentialReferenceIds = String(process.env.STUDIO_PROFESSIONAL_CREDENTIAL_REFERENCES ?? "").split(",").map(value => value.trim()).filter(Boolean);
const registry = new ProfessionalRunnerCapabilityRegistry({ credentialReferenceIds });
const result = requiredSkill ? await registry.resolve(requiredSkill) : await registry.inventory();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (requiredSkill && result.status !== "READY") process.exitCode = 2;
