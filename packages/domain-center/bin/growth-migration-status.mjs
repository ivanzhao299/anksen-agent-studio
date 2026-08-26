import pg from 'pg';
import {pathToFileURL} from 'node:url';
import {assertBusinessDatabaseUrl,resolveBusinessDatabaseTimeoutMs,resolveBusinessDatabaseUrl} from '../lib/business-database.mjs';
import {growthMigrationPaths} from '../lib/growth-database.mjs';
import {inspectGrowthMigrations} from '../lib/growth-migration-runner.mjs';

const {Pool}=pg;
const safety=Object.freeze({readOnly:true,ddlExecuted:false,migrationsApplied:false,credentialsReturned:false});

export function growthMigrationStatusError(error){const candidate=typeof error?.code==='string'?error.code:typeof error?.message==='string'?error.message:'';const code=/^[A-Z0-9][A-Z0-9_.:-]{2,100}$/.test(candidate)?candidate:'GROWTH_MIGRATION_STATUS_FAILED';return{schemaVersion:1,status:'ERROR',code,safety};}

export async function growthMigrationStatus({env=process.env,pool=null}={}){
  const timeoutMs=pool?null:resolveBusinessDatabaseTimeoutMs(env),database=pool??new Pool({connectionString:assertBusinessDatabaseUrl(resolveBusinessDatabaseUrl(env),{allowRemote:env.BUSINESS_DATABASE_ALLOW_REMOTE==='true'}),max:1,connectionTimeoutMillis:timeoutMs,query_timeout:timeoutMs,statement_timeout:timeoutMs,application_name:'anksen-growth-migration-status'});
  try{const report=await inspectGrowthMigrations(database,growthMigrationPaths);return{schemaVersion:1,...report,safety};}finally{if(!pool)await database.end();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const report=await growthMigrationStatus();console.log(JSON.stringify(report,null,2));if(report.status!=='READY')process.exitCode=2;}catch(error){console.error(JSON.stringify(growthMigrationStatusError(error)));process.exitCode=1;}
}
