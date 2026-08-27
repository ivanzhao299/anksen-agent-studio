#!/usr/bin/env node
import { resolve } from "node:path";
import { assertRepositoryIdentity } from "../lib/repository-identity.mjs";

const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
process.stdout.write(`${JSON.stringify(assertRepositoryIdentity(repoRoot), null, 2)}\n`);
