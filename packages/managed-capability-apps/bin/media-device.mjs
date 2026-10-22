import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { MediaDevice } from '../lib/media-device.mjs';
const configPath=resolve(process.env.STUDIO_MEDIA_DEVICE_CONFIG??`${homedir()}/.anksen-agent-studio/media-device.json`);
const config=JSON.parse(await readFile(configPath,'utf8')),token=(await readFile(config.tokenFile,'utf8')).trim();
if(token.length<32)throw new Error('MEDIA_DEVICE_TOKEN_UNAVAILABLE');
await mkdir(config.stateRoot,{recursive:true,mode:0o700});
const lockPath=resolve(config.stateRoot,'device.lock');let handle;
try{handle=await open(lockPath,'wx',0o600);}catch(e){if(e.code!=='EEXIST')throw e;const pid=Number(await readFile(lockPath,'utf8'));let alive=true;try{process.kill(pid,0);}catch(x){if(x.code==='ESRCH')alive=false;}if(alive)throw new Error('MEDIA_DEVICE_ALREADY_RUNNING');await unlink(lockPath);handle=await open(lockPath,'wx',0o600);}
await handle.writeFile(String(process.pid));await handle.close();
let stopping=false;process.once('SIGTERM',()=>{stopping=true;});process.once('SIGINT',()=>{stopping=true;});
const device=new MediaDevice({...config,token,root:config.stateRoot});
try{do{try{const result=await device.cycle();console.log(new Date().toISOString(),result.status);}catch(e){console.error(new Date().toISOString(),String(e.message).slice(0,200));}if(process.argv.includes('--once'))break;await new Promise(r=>setTimeout(r,5000));}while(!stopping);}finally{await unlink(lockPath).catch(()=>{});}
