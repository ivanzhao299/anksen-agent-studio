#!/usr/bin/env node
import { ProfessionalRunnerCapabilityRegistry } from "../lib/professional-runner-capabilities.mjs";
import { implementedProfessionalAdapterIds } from "../lib/professional-media-adapters.mjs";

const requiredSkill = process.argv.includes("--require-ready") ? process.argv[process.argv.indexOf("--require-ready") + 1] : null;
const executableSkill = process.argv.includes("--require-executable") ? process.argv[process.argv.indexOf("--require-executable") + 1] : null;
const credentialReferenceIds = String(process.env.STUDIO_PROFESSIONAL_CREDENTIAL_REFERENCES ?? "").split(",").map(value => value.trim()).filter(Boolean);
const registry = new ProfessionalRunnerCapabilityRegistry({ credentialReferenceIds, registeredAdapterIds:implementedProfessionalAdapterIds });
const result = requiredSkill ? await registry.resolve(requiredSkill) : await registry.inventory();
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (requiredSkill && result.status !== "READY") process.exitCode = 2;
if(executableSkill){const inventory=requiredSkill?await registry.inventory():result,candidates=inventory.profiles.filter(item=>item.skill_types.includes(executableSkill)),executable=candidates.find(item=>item.execution_readiness==="EXECUTABLE");if(!executable){process.stderr.write(`No activated executable Runner for ${executableSkill}.\n`);process.exitCode=3;}}
