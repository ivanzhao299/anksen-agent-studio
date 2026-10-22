import {existsSync} from "node:fs";
import {spawnSync} from "node:child_process";
import { execFile as childExec } from "node:child_process";
import {promisify} from "node:util";
import {readFile} from "node:fs/promises";
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { MediaWorkbench } from '../lib/media-workbench.mjs';
import { MediaDevice } from '../lib/media-device.mjs';
import { ResidentWorkerBroker } from '../../orchestrator-core/lib/resident-worker-broker.mjs';
const TEST_FFPROBE=existsSync('/opt/homebrew/opt/ffmpeg-full/bin/ffprobe')?'/opt/homebrew/opt/ffmpeg-full/bin/ffprobe':'ffprobe';
const TEST_FFMPEG=existsSync('/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg')?'/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg':'ffmpeg';
const HAS_NATIVE_TOOLS=spawnSync(TEST_FFPROBE,['-version']).status===0&&spawnSync(TEST_FFMPEG,['-version']).status===0;
function wav(){const n=48000,raw=Buffer.alloc(44+n*2);raw.write('RIFF');raw.writeUInt32LE(raw.length-8,4);raw.write('WAVEfmt ',8);raw.writeUInt32LE(16,16);raw.writeUInt16LE(1,20);raw.writeUInt16LE(1,22);raw.writeUInt32LE(48000,24);raw.writeUInt32LE(96000,28);raw.writeUInt16LE(2,32);raw.writeUInt16LE(16,34);raw.write('data',36);raw.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)raw.writeInt16LE(Math.round(Math.sin(i*440*Math.PI/24000)*1000),44+i*2);return raw;}
test('outbound adapter executes separated reference and A/B through broker, verifies audio and survives replay without regenerating', {skip: !HAS_NATIVE_TOOLS},async t=>{
 const root=await mkdtemp(join(tmpdir(),'media-device-'));t.after(()=>rm(root,{recursive:true,force:true}));const broker=new ResidentWorkerBroker({storePath:join(root,'broker.json')}),m=new MediaWorkbench({repoRoot:root,broker,enabled:true,projectIds:['studio']}),actor=m.actor({authenticated:true,user:{user_id:'alice'},project_allowlist:['studio']},'studio'),audio=wav(),calls={},jobs={};let localProfile=null;
 const response=data=>new Response(Buffer.isBuffer(data)?data:JSON.stringify(data),{headers:{'content-type':Buffer.isBuffer(data)?'audio/wav':'application/json'}});
 const fake=async(url,options={})=>{
  const u=new URL(url),path=u.pathname,body=options.body&&!Buffer.isBuffer(options.body)?JSON.parse(options.body):options.body;calls[path]=(calls[path]??0)+1;
  if(u.port==='8189'){
   if(path==='/')return new Response('const TOKEN = "fixture-token"');
   if(path==='/api/v1/voice/parameters')return response({fields:[{key:'seed',default:3,kind:'number',label:'Seed'}]});
   if(path==='/api/v1/separations'&&body)return response({id:'sep-1',status:'queued'});
   if(path==='/api/v1/separations')return response({jobs:[{id:'sep-1',status:'success',audio:'/separation-media/sep-1.wav',duration:1,elapsed:.1}]});
   if(path==='/api/v1/voices'&&body){localProfile={id:'profile-1',name:body.name};return response(localProfile);}
   if(path==='/api/v1/voices')return response({voices:localProfile?[localProfile]:[]});
   if(path==='/api/v1/voice/pairs'){for(const [i,v]of ['A','B'].entries())jobs[v]={id:v,status:'success',parameters:{...body.parameters,seed:3+i},audio:'/voice-media/'+v+'.wav',elapsed:.1};return response({jobs:Object.values(jobs)});}
   if(path.startsWith('/api/v1/voice/jobs/'))return response(jobs[path.split('/').at(-1)]);
   if(/^\/(voice-media|voice-reference-previews|separation-media)\//.test(path))return response(audio);
   throw new Error('Unexpected local path '+path);
  }
  const match=path.match(/^\/api\/resident-workers\/([^/]+)\/(.*)$/),worker=match?.[1],tail=match?.[2],li={leaseToken:options.headers['x-media-lease'],fencingToken:Number(options.headers['x-media-fencing'])};
  if(path==='/api/resident-workers/register')return response(await broker.register(body));
  if(tail==='media/catalog'){await m.catalog(body);return response({status:'OK'});}
  if(tail==='claim')return response({task:await broker.claim(worker)});
  let x;
  if((x=tail.match(/^tasks\/([^/]+)\/result$/))){await m.validateResult(worker,x[1],body);return response(await broker.complete(worker,x[1],body));}
  if((x=tail.match(/^tasks\/([^/]+)\/lease$/)))return response(await broker.renew(worker,x[1],body));
  if((x=tail.match(/^media\/tasks\/([^/]+)\/assets\/([^/]+)$/))){const a=await m.workerAsset(worker,x[1],li,x[2]);const {readFile}=await import('node:fs/promises');return response(await readFile(a.path));}
  if((x=tail.match(/^media\/tasks\/([^/]+)\/outputs$/)))return response(await m.workerOutput(worker,x[1],{...body,...li}));
  if((x=tail.match(/^media\/tasks\/([^/]+)\/outputs\/([^/]+)\/chunks\/(\d+)$/)))return response(await m.workerChunk(worker,x[1],li,x[2],x[3],body));
  if((x=tail.match(/^media\/tasks\/([^/]+)\/outputs\/([^/]+)\/complete$/)))return response(await m.workerCompleteUpload(worker,x[1],li,x[2]));
  throw new Error('Unexpected remote path '+path);
 };
 const device=new MediaDevice({baseUrl:'http://127.0.0.1:9999',token:'fixture',projectIds:['studio'],root:join(root,'device'),fetchImpl:fake,ffprobe:TEST_FFPROBE});await device.cycle();
 const upload=await m.initialize(actor,{name:'测试.wav',size:audio.length,sha256:createHash('sha256').update(audio).digest('hex')});await m.chunk(actor,upload.upload_id,0,audio);const blob=await m.complete(actor,upload.upload_id);
 const sep=await m.submit(actor,{operation:'separate',requestId:'sep',blobId:blob.id});await device.cycle();let state=await m.dashboard(actor);assert.equal(state.items[0].status,'SUCCEEDED');const separated=state.items[0].result.blobId;
 const profile=await m.submit(actor,{operation:'profile',requestId:'profile',blobId:separated,name:'验证音色',start:0,end:3});await device.cycle();
 const voice=await m.submit(actor,{operation:'voice',requestId:'pair',profileId:profile.taskId,text:'验证文字',pair:true,parameters:{seed:3}});await device.cycle();state=await m.dashboard(actor);const result=state.items.find(x=>x.taskId===voice.taskId);assert.equal(result.status,'SUCCEEDED');assert.equal(result.result.variants.length,2);assert.equal(result.result.variants[1].parameters.seed,4);await m.selected(actor,voice.taskId,'B');assert.equal((await m.dashboard(actor)).preference.parameters.seed,4);
 assert.equal(calls['/api/v1/voice/pairs'],1);await m.submit(actor,{operation:'voice',requestId:'pair',profileId:profile.taskId,text:'验证文字',pair:true,parameters:{seed:3}});await device.cycle();assert.equal(calls['/api/v1/voice/pairs'],1);assert.equal((await m.dashboard(actor)).items.find(x=>x.taskId===sep.taskId).status,'SUCCEEDED');
});

test('video adapter checks real dimensions, 24fps and sound without generating new AI content', {skip: !HAS_NATIVE_TOOLS},async t=>{
 const root=await mkdtemp(join(tmpdir(),'media-video-format-'));t.after(()=>rm(root,{recursive:true,force:true}));const file=join(root,'fixture.mp4');
 await promisify(childExec)(TEST_FFMPEG,['-v','error','-f','lavfi','-i','color=c=navy:s=1024x576:r=24','-f','lavfi','-i','sine=frequency=220:sample_rate=48000','-t','0.5','-c:v','mpeg4','-c:a','aac',file],{timeout:20000});const video=await readFile(file);let calls=0;
 const device=new MediaDevice({baseUrl:'http://127.0.0.1:9999',token:'fixture',projectIds:['studio'],root:join(root,'device'),ffprobe:TEST_FFPROBE});
 device.local=async(path,body)=>{if(path==='/api/generate'){calls++;return {id:'video-1'};}if(path==='/api/status')return {jobs:[{id:'video-1',status:'success',videos:['/media/video.mp4'],elapsed:.3,seed:7}]};if(path==='/media/video.mp4')return video;throw new Error('Unexpected fixture path');};device.api=async()=>({});device.output=async(_task,raw)=>{assert.equal(raw.length,video.length);return {id:'blob-fixture'};};
 const task={taskId:'media-format-fixture',lease:{token:'fixture',fencingToken:1},media:{operation:'video',mode:'text',size:'1024x576',frames:56,seed:7,prompt:'format fixture',assets:[]}};
 const result=await device.execute(task);assert.equal(result.width,1024);assert.equal(result.height,576);assert.equal(result.fps,24);assert.equal(result.hasAudio,true);assert.equal(calls,1);await device.execute(task);assert.equal(calls,1);
});

test('device rejects playlist payloads before passing untrusted uploads to the local managed app', {skip: !HAS_NATIVE_TOOLS},async t=>{const root=await mkdtemp(join(tmpdir(),'media-input-'));t.after(()=>rm(root,{recursive:true,force:true}));const d=new MediaDevice({baseUrl:'http://127.0.0.1:9999',token:'fixture',projectIds:['studio'],root,ffprobe:TEST_FFPROBE});await assert.rejects(d.validateInput(Buffer.from('#EXTM3U\nfile:///private/reference.wav\n'),'.mp4'),/不支持播放列表/);await assert.rejects(d.validateInput(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),'.png'),/SIGNATURE_INVALID/);await d.validateInput(wav(),'.wav');});

test('A/B preserves a successful candidate when its sibling fails', {skip:!HAS_NATIVE_TOOLS},async t=>{
 const root=await mkdtemp(join(tmpdir(),'media-partial-'));t.after(()=>rm(root,{recursive:true,force:true}));const device=new MediaDevice({baseUrl:'http://127.0.0.1:9999',token:'fixture',projectIds:['studio'],root,ffprobe:TEST_FFPROBE});await device.save({tasks:{'owned-profile':{profile:{id:'local-owned-profile'}}}});
 device.local=async(path,body)=>{if(path==='/api/v1/voice/pairs')return {jobs:[{id:'A'},{id:'B'}]};if(path==='/api/v1/voice/jobs/A')return {status:'success',audio:'/voice-media/A.wav',parameters:{seed:1},elapsed:.1};if(path==='/api/v1/voice/jobs/B')return {status:'failed',error:'fixture model failure'};if(path==='/voice-media/A.wav')return wav();throw new Error('Unexpected local fixture');};device.api=async()=>({});device.output=async()=>({id:'owned-audio'});
 const result=await device.execute({taskId:'media-partial',lease:{token:'fixture',fencingToken:1},media:{operation:'voice',profileTaskId:'owned-profile',pair:true,text:'fixture',style:'',parameters:{seed:1}}});assert.equal(result.partial,true);assert.equal(result.variants[0].status,'SUCCEEDED');assert.equal(result.variants[1].status,'FAILED');assert.equal(result.variants[0].parameters.seed,1);assert.equal(result.variants[1].blobId,undefined);
});
