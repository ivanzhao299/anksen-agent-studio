import pg from 'pg';
import {pathToFileURL} from 'node:url';
import {assertBusinessDatabaseUrl,resolveBusinessDatabaseUrl} from '../lib/business-database.mjs';
import {growthMigrationPaths} from '../lib/growth-database.mjs';
import {inspectGrowthMigrations} from '../lib/growth-migration-runner.mjs';

const {Pool}=pg;

export async function growthMigrationStatus({env=process.env,pool=null}={}){
  const database=pool??new Pool({connectionString:assertBusinessDatabaseUrl(resolveBusinessDatabaseUrl(env),{allowRemote:env.BUSINESS_DATABASE_ALLOW_REMOTE==='true'}),max:1,application_name:'anksen-growth-migration-status'});
  try{return await inspectGrowthMigrations(database,growthMigrationPaths);}finally{if(!pool)await database.end();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const report=await growthMigrationStatus();console.log(JSON.stringify(report,null,2));if(report.status!=='READY')process.exitCode=2;}catch(error){console.error(JSON.stringify({status:'ERROR',code:error?.code??error?.message??'GROWTH_MIGRATION_STATUS_FAILED'}));process.exitCode=1;}
}
