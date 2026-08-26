import test from "node:test";
import assert from "node:assert/strict";
import {chmod,mkdtemp,readFile,rm,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import { assertBusinessDatabaseUrl,createBusinessApplicationRuntime, resolveBusinessDatabasePoolMax,resolveBusinessDatabaseTimeoutMs,resolveBusinessDatabaseUrl } from "../lib/business-database.mjs";

test("business database configuration is local, explicit and credential-backed", () => {
  const url = "postgresql://business:password@127.0.0.1:4330/anksen_studio_business";
  assert.equal(assertBusinessDatabaseUrl(url), url);
  assert.throws(()=>assertBusinessDatabaseUrl("postgresql://business:password@db.example.com/anksen_business",{allowRemote:"false"}),/OPTIONS_INVALID/);
  let optionGetterCalls=0;const options=Object.defineProperty({},"allowRemote",{enumerable:true,get(){optionGetterCalls+=1;return true;}});assert.throws(()=>assertBusinessDatabaseUrl(url,options),/OPTIONS_INVALID/);assert.equal(optionGetterCalls,0);
  assert.equal(resolveBusinessDatabaseUrl({ BUSINESS_DATABASE_URL: url }), url);
  assert.throws(()=>resolveBusinessDatabaseUrl({BUSINESS_DATABASE_URL:` ${url}`}),/URL_INVALID/);
  assert.throws(()=>resolveBusinessDatabaseUrl({BUSINESS_DATABASE_URL:{toString:()=>url}}),/ENV_INVALID/);
  let getterCalls=0;const accessor=Object.defineProperty({},"BUSINESS_DATABASE_URL",{enumerable:true,get(){getterCalls+=1;return url;}});assert.throws(()=>resolveBusinessDatabaseUrl(accessor),/ENV_INVALID/);assert.equal(getterCalls,0);
  assert.throws(() => assertBusinessDatabaseUrl("postgresql://business:password@db.example.com/prod"), /REMOTE_DENIED/);
  assert.throws(()=>assertBusinessDatabaseUrl("postgresql://business:password@db.example.com/anksen_business",{allowRemote:true}),/REMOTE_TLS_REQUIRED/);
  assert.throws(()=>assertBusinessDatabaseUrl("postgresql://business:password@db.example.com/anksen_business?sslmode=disable",{allowRemote:true}),/REMOTE_TLS_REQUIRED/);
  assert.equal(assertBusinessDatabaseUrl("postgresql://business:password@db.example.com/anksen_business?sslmode=verify-full",{allowRemote:true}),"postgresql://business:password@db.example.com/anksen_business?sslmode=verify-full");
  assert.throws(()=>assertBusinessDatabaseUrl("POSTGRESQL://business:password@127.0.0.1/anksen_business"),/PROTOCOL_DENIED/);
  for(const port of ["0","65536"])assert.throws(()=>assertBusinessDatabaseUrl(`postgresql://business:password@127.0.0.1:${port}/anksen_business`),/PORT_DENIED|URL_INVALID/);
  assert.throws(() => assertBusinessDatabaseUrl("postgresql://business:password@127.0.0.1/postgres"), /NAME_DENIED/);
  for(const name of ["notbusinessprod","business/other","business%2Fprod","Anksen_Business"])assert.throws(()=>assertBusinessDatabaseUrl(`postgresql://business:password@127.0.0.1/${name}`),/NAME_DENIED/);
  assert.throws(() => assertBusinessDatabaseUrl("postgresql://127.0.0.1/anksen_business"), /CREDENTIAL_REQUIRED/);
  for(const credentials of ["business:pass%0Aword","business:pass%00word","business:pass%ZZword"])assert.throws(()=>assertBusinessDatabaseUrl(`postgresql://${credentials}@127.0.0.1/anksen_business`),/CREDENTIAL_INVALID/);
  assert.equal(assertBusinessDatabaseUrl("postgresql://business:password@127.0.0.1/anksen_business?sslmode=require"),"postgresql://business:password@127.0.0.1/anksen_business?sslmode=require");
  for(const query of ["host=db.example.com","sslcert=/tmp/client.pem","port=5432","sslmode=require&sslmode=disable","sslmode=unknown"])assert.throws(()=>assertBusinessDatabaseUrl(`postgresql://business:password@127.0.0.1/anksen_business?${query}`),/QUERY_DENIED/);
  for(const value of ["not a url password=secret","postgresql://business:password@127.0.0.1/anksen_business#fragment",`postgresql://business:password@127.0.0.1/anksen_business?token=secret`,"x".repeat(4097)])assert.throws(()=>assertBusinessDatabaseUrl(value),error=>!JSON.stringify(error).includes('token=secret')&&!JSON.stringify(error).includes('password=secret'));
});

test("business database pool size is explicitly bounded",()=>{assert.equal(resolveBusinessDatabasePoolMax({}),10);assert.equal(resolveBusinessDatabasePoolMax({BUSINESS_DATABASE_POOL_MAX:'50'}),50);for(const value of ['0','51','1.5','Infinity','many'])assert.throws(()=>resolveBusinessDatabasePoolMax({BUSINESS_DATABASE_POOL_MAX:value}),/BUSINESS_DATABASE_POOL_MAX_INVALID/);assert.throws(()=>resolveBusinessDatabasePoolMax({BUSINESS_DATABASE_POOL_MAX:{valueOf:()=>10}}),/ENV_INVALID/);});

test("business database timeouts are explicitly bounded",()=>{assert.equal(resolveBusinessDatabaseTimeoutMs({}),10000);assert.equal(resolveBusinessDatabaseTimeoutMs({BUSINESS_DATABASE_TIMEOUT_MS:'60000'}),60000);for(const value of ['99','60001','1.5','Infinity','many'])assert.throws(()=>resolveBusinessDatabaseTimeoutMs({BUSINESS_DATABASE_TIMEOUT_MS:value}),/BUSINESS_DATABASE_TIMEOUT_INVALID/);});

test("business runtime can bind existing stores without schema writes",async()=>{let queries=0,connections=0,getterCalls=0;const pool={async query(){queries+=1;throw new Error("must not query");},async connect(){connections+=1;throw new Error("must not connect");}};const runtime=await createBusinessApplicationRuntime({repoRoot:process.cwd(),pool,env:{},initializeSchema:false});assert.equal(runtime.backend,"POSTGRESQL");assert.equal(runtime.ownsPool,false);assert.equal(queries,0);assert.equal(connections,0);await assert.rejects(()=>createBusinessApplicationRuntime({repoRoot:process.cwd(),pool,env:{},initializeSchema:"false"}),/SCHEMA_MODE_INVALID/);await assert.rejects(()=>createBusinessApplicationRuntime({repoRoot:process.cwd(),pool,env:{},initializeSchema:false,requirePostgres:"true"}),/ENV_INVALID/);await assert.rejects(()=>createBusinessApplicationRuntime({repoRoot:process.cwd(),pool,env:{BUSINESS_DATABASE_ALLOW_REMOTE:"yes"},initializeSchema:false}),/ENV_INVALID/);const env=Object.defineProperty({},"BUSINESS_DATABASE_REQUIRED",{enumerable:true,get(){getterCalls+=1;return"true";}});await assert.rejects(()=>createBusinessApplicationRuntime({repoRoot:process.cwd(),pool,env,initializeSchema:false}),/ENV_INVALID/);assert.equal(getterCalls,0);assert.equal(queries,0);assert.equal(connections,0);});

test("business database URL files are bounded absolute private real files",async()=>{const directory=await mkdtemp(join(tmpdir(),'anksen-db-url-')),path=join(directory,'database-url'),link=join(directory,'database-url-link'),directoryLink=join(directory,'linked-directory'),url='postgresql://business:password@127.0.0.1/anksen_business';try{await writeFile(path,`${url}\n`,{mode:0o600});assert.equal(resolveBusinessDatabaseUrl({BUSINESS_DATABASE_URL_FILE:path}),url);await chmod(directory,0o755);assert.throws(()=>resolveBusinessDatabaseUrl({BUSINESS_DATABASE_URL_FILE:path}),/URL_FILE_INVALID/);await chmod(directory,0o700);await symlink(directory,directoryLink);assert.throws(()=>resolveBusinessDatabaseUrl({BUSINESS_DATABASE_URL_FILE:join(directoryLink,'database-url')}),/URL_FILE_INVALID/);await chmod(path,0o644);assert.throws(()=>resolveBusinessDatabaseUrl({BUSINESS_DATABASE_URL_FILE:path}),/URL_FILE_INVALID/);await chmod(path,0o600);await symlink(path,link);assert.throws(()=>resolveBusinessDatabaseUrl({BUSINESS_DATABASE_URL_FILE:link}),/URL_FILE_INVALID/);for(const value of [` ${url}`,`${url}\n\n`,'   ',Uint8Array.from([0xff]),'x'.repeat(4097)]){await writeFile(path,value);assert.throws(()=>resolveBusinessDatabaseUrl({BUSINESS_DATABASE_URL_FILE:path}),/URL_FILE_INVALID/);}assert.throws(()=>resolveBusinessDatabaseUrl({BUSINESS_DATABASE_URL_FILE:'relative/database-url'}),/URL_FILE_INVALID/);assert.throws(()=>resolveBusinessDatabaseUrl({BUSINESS_DATABASE_URL_FILE:directory}),/URL_FILE_INVALID/);}finally{await rm(directory,{recursive:true,force:true});}});

test("Office deployment provisions and verifies isolated business PostgreSQL before restart", async () => {
  const compose = await readFile(new URL("../../../infrastructure/business-data/docker-compose.yml", import.meta.url), "utf8");
  const deployData = await readFile(new URL("../../../scripts/deploy-business-data.sh", import.meta.url), "utf8");
  const deploy = await readFile(new URL("../../../scripts/deploy.sh", import.meta.url), "utf8");
  const server = await readFile(new URL("../../../apps/console/web/server.mjs", import.meta.url), "utf8");
  assert.match(compose, /127\.0\.0\.1:\$\{BUSINESS_DB_PORT:-54330\}:5432/);
  assert.match(compose, /business-db-data/);
  assert.match(deployData, /openssl rand -hex 32/);
  assert.match(deployData, /BUSINESS_DATABASE_REQUIRED=true/);
  assert.match(deployData, /already occupied by another service/);
  assert.match(deployData, /business-database-migrate\.mjs/);
  assert.match(deploy, /deploy-business-data\.sh/);
  assert.match(server, /createBusinessApplicationRuntime/);
  assert.match(server, /businessRuntime\.pool/);
});
