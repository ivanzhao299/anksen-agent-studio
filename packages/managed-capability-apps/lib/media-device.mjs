import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile), sha=b=>createHash('sha256').update(b).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Outbound adapter only: it claims existing broker tasks and hands fixed operations to the local managed app.
export class MediaDevice {
  constructor({baseUrl,token,workerId='mac-media-1',projectIds,root,localOrigin='http://127.0.0.1:8189',fetchImpl=fetch,ffprobe='/opt/homebrew/opt/ffmpeg-full/bin/ffprobe'}) {
    if(!baseUrl.startsWith('https://')&&!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseUrl))throw new Error('MEDIA_HTTPS_REQUIRED');
    if(localOrigin!=='http://127.0.0.1:8189')throw new Error('MEDIA_LOCAL_ORIGIN_FIXED');
    Object.assign(this,{baseUrl,token,workerId,projectIds,root:resolve(root),localOrigin,fetch:fetchImpl,ffprobe});this.localToken=null;this.active=null;this.lost=false;
  }
  async api(path,body,options={}) {const {binary,...rest}=options;const r=await this.fetch(this.baseUrl+path,{...rest,method:options.method??(body===undefined?'GET':'POST'),headers:{authorization:`Bearer ${this.token}`,...(body!==undefined&&!Buffer.isBuffer(body)?{'content-type':'application/json'}:{}),...(this.active?{'x-media-lease':this.active.lease.token,'x-media-fencing':String(this.active.lease.fencingToken)}:{}),...options.headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.status??`MEDIA_HTTP_${r.status}`);}return binary?Buffer.from(await r.arrayBuffer()):r.json();}
  async local(path,body,binary=false){if(!/^\/(api\/|voice-media\/|voice-reference-previews\/|separation-media\/|media\/)/.test(path))throw new Error('MEDIA_LOCAL_PATH_INVALID');if(body!==undefined&&!this.localToken){const r=await this.fetch(this.localOrigin+'/',{signal:AbortSignal.timeout(10000)});this.localToken=(await r.text()).match(/const TOKEN = "([^"]+)"/)?.[1];if(!this.localToken)throw new Error('MEDIA_LOCAL_TOKEN_UNAVAILABLE');}const r=await this.fetch(this.localOrigin+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'content-type':'application/json','X-Studio-Token':this.localToken,Origin:this.localOrigin},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(90000)});if(r.status===403)this.localToken=null;if(!r.ok){const d=await r.json().catch(()=>({}));throw new Error(d.error??`LOCAL_MEDIA_HTTP_${r.status}`);}return binary?Buffer.from(await r.arrayBuffer()):r.json();}
  async state(){try{return JSON.parse(await readFile(resolve(this.root,'journal.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {tasks:{}};}}
  async save(s){await mkdir(this.root,{recursive:true,mode:0o700});const p=resolve(this.root,'journal.tmp');await writeFile(p,JSON.stringify(s),{mode:0o600});await rename(p,resolve(this.root,'journal.json'));}
  prefix(taskId){return `/api/resident-workers/${this.workerId}/media/tasks/${taskId}`;}
  async input(t,assetId){const a=t.media.assets.find(x=>x.id===assetId);if(!a)throw new Error('MEDIA_INPUT_MISSING');const raw=await this.api(this.prefix(t.taskId)+'/assets/'+assetId,undefined,{binary:true});if(raw.length!==a.size||sha(raw)!==a.sha256)throw new Error('MEDIA_INPUT_HASH_MISMATCH');await this.validateInput(raw,a.extension);return raw;}
  async validateInput(raw,extension) {
    const imageSignatures={'.png':b=>b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'.jpg':b=>b[0]===255&&b[1]===216&&b[2]===255,'.jpeg':b=>b[0]===255&&b[1]===216&&b[2]===255,'.webp':b=>b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'};
    if(imageSignatures[extension]){if(!imageSignatures[extension](raw))throw new Error('MEDIA_IMAGE_SIGNATURE_INVALID');return;}
    const formats={'.wav':'wav','.mp3':'mp3','.m4a':'mov','.mp4':'mov','.mov':'mov','.m4v':'mov','.mkv':'matroska','.webm':'matroska','.flac':'flac','.ogg':'ogg','.aac':'aac','.aiff':'aiff','.aif':'aiff'},format=formats[extension];if(!format)throw new Error('MEDIA_INPUT_FORMAT_UNSUPPORTED');
    await mkdir(this.root,{recursive:true,mode:0o700});const path=resolve(this.root,'input-'+sha(raw).slice(0,24)+extension);await writeFile(path,raw,{mode:0o600});
    try{const {stdout}=await exec(this.ffprobe,['-v','error','-protocol_whitelist','file,pipe','-f',format,...(format==='mov'?['-enable_drefs','0','-use_absolute_path','0']:[]),'-show_entries','stream=codec_type','-of','json',path],{timeout:20000,maxBuffer:256000});const d=JSON.parse(stdout);if(!d.streams?.some(s=>['audio','video'].includes(s.codec_type)))throw new Error('INVALID');}
    catch{throw new Error('请上传原始音视频文件，不支持播放列表或无效媒体。');}finally{await unlink(path).catch(()=>{});}
  }
  async output(t,raw,name){this.checkLease();const u=await this.api(this.prefix(t.taskId)+'/outputs',{name,size:raw.length,sha256:sha(raw)});for(let i=0;i<u.chunk_count;i++){this.checkLease();await this.api(this.prefix(t.taskId)+`/outputs/${u.upload_id}/chunks/${i}`,raw.subarray(i*u.chunk_size,(i+1)*u.chunk_size),{method:'PUT'});}return this.api(this.prefix(t.taskId)+`/outputs/${u.upload_id}/complete`,{});}
  checkLease(){if(this.lost)throw new Error('MEDIA_LEASE_LOST');}
  async wait(get){const deadline=Date.now()+6*3600000;while(Date.now()<deadline){this.checkLease();const result=await get();const stage=result.status==='queued'?'等待共享生成资源':'模型正在生成';if(this.active&&stage!==this.lastStage){await this.api(`/api/resident-workers/${this.workerId}/tasks/${this.active.taskId}/lease`,{leaseToken:this.active.lease.token,fencingToken:this.active.lease.fencingToken,stage});this.lastStage=stage;}if(result.status==='success')return result;if(['failed','unknown'].includes(result.status))throw new Error(result.error??'MEDIA_GENERATION_FAILED');await sleep(3000);}throw new Error('MEDIA_EXECUTION_TIMEOUT');}
  async probe(raw,name){const path=resolve(this.root,name);await writeFile(path,raw,{mode:0o600});const {stdout}=await exec(this.ffprobe,['-v','error','-show_entries','format=duration:stream=codec_type,width,height,avg_frame_rate','-of','json',path],{timeout:20000,maxBuffer:256000});const d=JSON.parse(stdout),v=d.streams.find(x=>x.codec_type==='video');return {duration:Number(d.format.duration),hasAudio:d.streams.some(x=>x.codec_type==='audio'),width:v?.width,height:v?.height,fps:v?.avg_frame_rate?Number(v.avg_frame_rate.split('/')[0])/Number(v.avg_frame_rate.split('/')[1]):null};}
  async execute(t){this.active=t;this.lost=false;this.lastStage='';const journal=await this.state(),s=journal.tasks[t.taskId]??={};
    const renew=setInterval(()=>this.api(`/api/resident-workers/${this.workerId}/tasks/${t.taskId}/lease`,{leaseToken:t.lease.token,fencingToken:t.lease.fencingToken}).catch(()=>{this.lost=true;}),10000);renew.unref();
    try{if(s.result)return s.result;const m=t.media;let result;
      if(m.operation==='separate'){
        if(!s.job){s.job=await this.local('/api/v1/separations',{filename:'source'+m.assets[0].extension,audio:(await this.input(t,m.blobId)).toString('base64'),request_id:t.taskId});await this.save(journal);}
        const done=await this.wait(async()=>{const data=await this.local('/api/v1/separations');return data.jobs.find(j=>j.id===s.job.id)??{status:'unknown'};});
        const raw=await this.local(done.audio,undefined,true),p=await this.probe(raw,'separated.wav');const b=await this.output(t,raw,'vocals.wav');result={blobId:b.id,duration:p.duration,elapsed:done.elapsed};
      }else if(m.operation==='profile'){
        const uniqueName='Studio-'+t.taskId.slice(-32);
        if(!s.profile){const existing=(await this.local('/api/v1/voices')).voices.find(x=>x.name===uniqueName);s.profile=existing??await this.local('/api/v1/voices',{name:uniqueName,filename:'reference.wav',audio:(await this.input(t,m.blobId)).toString('base64'),start:m.start,end:m.end});await this.save(journal);}
        const raw=await this.local('/voice-reference-previews/'+s.profile.id+'.wav',undefined,true),b=await this.output(t,raw,'reference.wav');result={previewBlobId:b.id,referenceSeconds:m.end-m.start};
      }else if(m.operation==='voice'){
        const profile=m.parameters.mode==='zero_shot'?{id:'jinhu-male'}:journal.tasks[m.profileTaskId]?.profile;if(!profile)throw new Error('MEDIA_DEVICE_PROFILE_MISSING');const parameters={...m.parameters};if(parameters.prompt_profile_task){parameters.prompt_profile=journal.tasks[parameters.prompt_profile_task]?.profile?.id;if(!parameters.prompt_profile)throw new Error('MEDIA_PROMPT_PROFILE_MISSING');delete parameters.prompt_profile_task;}
        if(!s.jobs){const input={text:m.text,style:m.style,profile:profile.id,parameters,request_id:t.taskId,title:'Studio '+t.taskId.slice(-8)+' 试听'};s.jobs=m.pair?(await this.local('/api/v1/voice/pairs',input)).jobs:[await this.local('/api/v1/voice/jobs',input)];await this.save(journal);}
        const variants=[];for(const [i,j] of s.jobs.entries()){
          const done=await this.wait(()=>this.local('/api/v1/voice/jobs/'+j.id)),raw=await this.local(done.audio,undefined,true),p=await this.probe(raw,'voice.wav');if(!p.hasAudio)throw new Error('MEDIA_AUDIO_MISSING');const b=await this.output(t,raw,`voice-${i}.wav`),params={...done.parameters};if(m.parameters.prompt_profile_task)params.prompt_profile=m.parameters.prompt_profile_task;variants.push({variant:i?'B':'A',blobId:b.id,parameters:params,duration:p.duration,elapsed:done.elapsed});
        }result={variants,profileId:m.profileTaskId,style:m.style};
      }else if(m.operation==='video'){
        // The managed local app arbitrates the shared ComfyUI resource. Never clear its queue.
        if(!s.job){const input={mode:m.mode,prompt:m.prompt,sound:m.sound,size:m.size,frames:m.frames,seed:m.seed,request_id:t.taskId,title:'Studio '+t.taskId.slice(-8)};if(m.mode==='image')input.image=(await this.input(t,m.blobId)).toString('base64');s.job=await this.local('/api/generate',input);await this.save(journal);}
        const done=await this.wait(async()=>{const data=await this.local('/api/status');return data.jobs.find(j=>j.id===s.job.id)??{status:'unknown'};});const raw=await this.local(done.videos[0],undefined,true),p=await this.probe(raw,'video.mp4');if(!p.hasAudio||!p.width||!p.height)throw new Error('MEDIA_VIDEO_OR_AUDIO_MISSING');if(`${p.width}x${p.height}`!==m.size||!Number.isFinite(p.fps)||Math.abs(p.fps-24)>.01)throw new Error('MEDIA_VIDEO_FORMAT_MISMATCH');const b=await this.output(t,raw,'video.mp4');result={blobId:b.id,...p,elapsed:done.elapsed,seed:done.seed};
      }else throw new Error('MEDIA_OPERATION_UNSUPPORTED');
      this.checkLease();s.result=result;await this.save(journal);return result;
    }finally{clearInterval(renew);this.active=null;}
  }
  async cycle(){const local=await this.local('/api/v1/voice/parameters');await this.api('/api/resident-workers/register',{workerId:this.workerId,projects:this.projectIds.map(projectId=>({projectId,pathRef:'local://media-workbench'})),capabilities:['media.execute.v1','lease-heartbeat','result-callback'],credentialReferenceId:'resident-worker-existing-token',autoExecute:true,lifecycle:{status:'READY'}});await this.api(`/api/resident-workers/${this.workerId}/media/catalog`,local);const {task}=await this.api(`/api/resident-workers/${this.workerId}/claim`,{});if(!task)return {status:'IDLE'};let result,status='SUCCEEDED',summary='媒体生成完成，产物已校验并回传';try{result=await this.execute(task);}catch(e){if(this.lost)throw e;status='FAILED';summary=String(e.message).slice(0,500);}return this.api(`/api/resident-workers/${this.workerId}/tasks/${task.taskId}/result`,{leaseToken:task.lease.token,fencingToken:task.lease.fencingToken,status,summary,evidence:{media:result??null}});}
}
