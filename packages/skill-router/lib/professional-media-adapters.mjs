import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const implementedProfessionalAdapterIds=Object.freeze(["ffmpeg-quality-adapter-v1"]);

export function createProfessionalMediaAdapters({repoRoot=process.cwd(),run=spawnSync}={}){
  const root=resolve(repoRoot),mediaRoot=resolve(root,"runtime/artifacts/media");
  return Object.freeze({
    "media-quality-control":async({request})=>{if(!request.inputPath)throw Object.assign(new Error("MEDIA_INPUT_REQUIRED"),{code:"MEDIA_INPUT_REQUIRED"});const [input,allowedRoot]=await Promise.all([realpath(resolve(root,request.inputPath)),realpath(mediaRoot)]);if(!(input===allowedRoot||input.startsWith(`${allowedRoot}/`)))throw Object.assign(new Error("MEDIA_INPUT_PATH_BLOCKED"),{code:"MEDIA_INPUT_PATH_BLOCKED"});const result=run("ffprobe",["-v","error","-show_format","-show_streams","-of","json",input],{encoding:"utf8",timeout:Math.min(Number(request.maxRuntimeMs??30000),30000),env:{PATH:process.env.PATH??""}});if(result.status!==0)throw Object.assign(new Error("FFPROBE_VALIDATION_FAILED"),{code:"FFPROBE_VALIDATION_FAILED"});let report;try{report=JSON.parse(result.stdout);}catch{throw Object.assign(new Error("FFPROBE_OUTPUT_INVALID"),{code:"FFPROBE_OUTPUT_INVALID"});}return{artifacts:[{name:"media-qa-report.json",mediaType:"application/json",content:`${JSON.stringify({schemaVersion:1,adapterId:"ffmpeg-quality-adapter-v1",format:report.format??{},streams:(report.streams??[]).map(stream=>({index:stream.index,codecType:stream.codec_type,codecName:stream.codec_name,width:stream.width,height:stream.height,frameRate:stream.avg_frame_rate,sampleRate:stream.sample_rate,channels:stream.channels}))},null,2)}\n`}]};}
  });
}
