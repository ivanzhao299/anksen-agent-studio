import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProfessionalRunnerCapabilityRegistry } from "../lib/professional-runner-capabilities.mjs";
import { ProfessionalRunnerExecutionService } from "../lib/professional-runner-execution.mjs";
import { createProfessionalMediaAdapters, implementedProfessionalAdapterIds } from "../lib/professional-media-adapters.mjs";
import { createHyperframesArtifactAdapter } from "../lib/hyperframes-artifact-adapter.mjs";
import { createKlingAiVideoAdapter } from "../lib/kling-ai-video-adapter.mjs";
import { createBlenderDigitalHumanAdapter } from "../lib/blender-digital-human-adapter.mjs";
import { ProfessionalRunnerKernelBridge } from "../lib/professional-runner-kernel-bridge.mjs";
import { projectProfessionalArtifacts } from "../lib/professional-artifact-projection.mjs";

test("professional runner inventory distinguishes installed skills, tools and credential references", async () => {
  const root = await mkdtemp(join(tmpdir(), "runner-capabilities-")), skillsRoot = join(root, "skills"), bin = join(root, "bin"), registryPath = join(root, "registry.json");
  await mkdir(join(skillsRoot, "video-use"), { recursive: true }); await mkdir(bin);
  await writeFile(join(skillsRoot, "video-use", "SKILL.md"), "---\nname: video-use\n---\n");
  await writeFile(join(bin, "ffmpeg"), "#!/bin/sh\necho ffmpeg-test\n", { mode: 0o755 });
  await writeFile(registryPath, JSON.stringify({ schema_version: 1, registry_id: "test", profiles: [{ profile_id: "editor", display_name: "Editor", runner_class: "FOOTAGE_EDITOR", skill_types: ["video_editing"], skill_packages: ["video-use"], tool_dependencies: [{ command: "ffmpeg", version_args: ["-version"] }], credential_references: ["speech-ref"], allowed_commands: [], blocked_commands: [], allowed_output_roots: [], network_policy: "DENY", side_effect_policy: "ARTIFACT_WRITE_ONLY", max_runtime_seconds: 60, max_parallel_tasks: 1, risk_level: "LOW" }] }));
  const blocked = new ProfessionalRunnerCapabilityRegistry({ registryPath, skillsRoot, env: { PATH: bin } });
  assert.equal((await blocked.resolve("video_editing")).status, "BLOCKED");
  const ready = new ProfessionalRunnerCapabilityRegistry({ registryPath, skillsRoot, env: { PATH: bin }, credentialReferenceIds: ["speech-ref"] });
  const result = await ready.resolve("video_editing"); assert.equal(result.status, "READY"); assert.equal(result.selected_profile_id, "editor");
});

test("unknown professional skill fails closed", async () => {
  const registry = new ProfessionalRunnerCapabilityRegistry();
  const result = await registry.resolve("unknown_media_skill");
  assert.equal(result.status, "BLOCKED"); assert.deepEqual(result.blocked_reasons, ["NO_RUNNER_PROFILE:unknown_media_skill"]);
});

test("installed capability remains non-executable until node activation",async()=>{const root=await mkdtemp(join(tmpdir(),"runner-gate-")),skillsRoot=join(root,"skills"),bin=join(root,"bin"),registryPath=join(root,"registry.json");await mkdir(join(skillsRoot,"video-skill"),{recursive:true});await mkdir(bin);await writeFile(join(skillsRoot,"video-skill","SKILL.md"),"---\nname: video-skill\n---\n");await writeFile(join(bin,"render-tool"),"#!/bin/sh\necho 1.2.3\n",{mode:0o755});const profile={profile_id:"render",capability_version:"1.2.0",adapter_id:"render-v1",activation:{required:true,environment_variable:"TEST_RENDER_ENABLED",default:false},display_name:"Render",runner_class:"VIDEO",skill_types:["video_generation"],skill_packages:["video-skill"],tool_dependencies:[{command:"render-tool",version_args:["--version"]}],credential_references:[],allowed_commands:["render"],blocked_commands:["git push"],allowed_output_roots:["runtime/artifacts/media"],network_policy:"DENY",side_effect_policy:"ARTIFACT_WRITE_ONLY",max_runtime_seconds:60,max_parallel_tasks:1,risk_level:"LOW"};await writeFile(registryPath,JSON.stringify({schema_version:1,registry_id:"test",profiles:[profile]}));const registry=new ProfessionalRunnerCapabilityRegistry({registryPath,skillsRoot,env:{PATH:bin},registeredAdapterIds:["render-v1"]}),inventory=await registry.inventory();assert.equal(inventory.profiles[0].installation_readiness,"READY");assert.equal(inventory.profiles[0].execution_readiness,"NOT_EXECUTABLE");assert.match(inventory.profiles[0].evidence_hash,/^[a-f0-9]{64}$/);const blocked=await registry.preflight({profileId:"render",skillType:"video_generation",taskId:"t1",attemptId:"a1",fencingToken:"f1",artifactRoot:"runtime/artifacts/media",command:"render"});assert.equal(blocked.status,"BLOCKED");assert.deepEqual(blocked.blocked_reasons,["RUNNER_NOT_ACTIVATED:render"]);});

test("execution gate writes hashed artifacts and chained audit without exposing fencing",async()=>{const root=await mkdtemp(join(tmpdir(),"runner-execution-")),skillsRoot=join(root,"skills"),bin=join(root,"bin"),registryPath=join(root,"registry.json");await mkdir(join(skillsRoot,"video-skill"),{recursive:true});await mkdir(bin);await writeFile(join(skillsRoot,"video-skill","SKILL.md"),"skill");await writeFile(join(bin,"render-tool"),"#!/bin/sh\necho 1.2.3\n",{mode:0o755});await writeFile(registryPath,JSON.stringify({schema_version:1,registry_id:"test",profiles:[{profile_id:"render",capability_version:"1.2.0",adapter_id:"render-v1",activation:{required:true,environment_variable:"TEST_RENDER_ENABLED",default:false},display_name:"Render",runner_class:"VIDEO",skill_types:["video_generation"],skill_packages:["video-skill"],tool_dependencies:[{command:"render-tool"}],credential_references:[],allowed_commands:["render"],blocked_commands:[],allowed_output_roots:["runtime/artifacts/media"],network_policy:"DENY",side_effect_policy:"ARTIFACT_WRITE_ONLY",max_runtime_seconds:60,max_parallel_tasks:1,risk_level:"LOW"}]}));const registry=new ProfessionalRunnerCapabilityRegistry({registryPath,skillsRoot,env:{PATH:bin,TEST_RENDER_ENABLED:"true"},registeredAdapterIds:["render-v1"]}),service=new ProfessionalRunnerExecutionService({registry,repoRoot:root,now:()=>new Date("2026-07-21T00:00:00Z"),adapters:{render:async()=>({artifacts:[{name:"result.txt",mediaType:"text/plain",content:"rendered"}]})}}),result=await service.execute({executionId:"exec-1",profileId:"render",workerProfileId:"render",skillType:"video_generation",taskId:"task-1",attemptId:"attempt-1",fencingToken:"secret-fence",artifactRoot:"runtime/artifacts/media",command:"render"});assert.equal(result.status,"SUCCEEDED");assert.equal(result.manifest.capabilityVersion,"1.2.0");assert.match(result.artifacts[0].sha256,/^[a-f0-9]{64}$/);const audit=await readFile(join(root,"runtime/artifacts/media/exec-1/audit-events.json"),"utf8");assert.match(audit,/professional\.execution\.started/);assert.match(audit,/professional\.execution\.succeeded/);assert.doesNotMatch(audit,/secret-fence/);});

test("media task routing selects the specific registered Skill and never upgrades installation to execution",async()=>{const registry=new ProfessionalRunnerCapabilityRegistry(),matrix=await registry.matchTask({id:"media-1",title:"生成短视频矩阵和渠道变体"});assert.equal(matrix.rule.rule_id,"RULE-VIDEO-MATRIX");assert.equal(matrix.rule.skill_type,"video_matrix_generation");assert.equal(matrix.status,"INSTALLED_MATCH");assert.equal(matrix.capability.execution_readiness,"NOT_EXECUTABLE");assert.ok(matrix.capability.blocked_reasons.some(reason=>reason.startsWith("RUNNER_NOT_ACTIVATED")));});

test("routing distinguishes Remotion composition, Manim animation and credential transcription",async()=>{const registry=new ProfessionalRunnerCapabilityRegistry(),remotion=await registry.matchTask({id:"r",title:"用 Remotion 生成 React 程序化视频"}),manim=await registry.matchTask({id:"m",title:"用 Manim 制作数学动画"}),transcription=await registry.matchTask({id:"t",title:"对音频进行逐词 transcription"});assert.equal(remotion.rule.rule_id,"RULE-REMOTION-PROGRAMMATIC");assert.equal(remotion.capability.profile_id,"media-programmatic-remotion");assert.equal(manim.rule.rule_id,"RULE-TECHNICAL-ANIMATION");assert.equal(manim.capability.profile_id,"media-technical-manim");assert.equal(transcription.rule.rule_id,"RULE-MEDIA-TRANSCRIPTION");assert.equal(transcription.status,"BLOCKED");});

test("implemented FFprobe adapter accepts only isolated media inputs and returns sanitized QA evidence",async()=>{const root=await mkdtemp(join(tmpdir(),"media-adapter-")),media=join(root,"runtime/artifacts/media");await mkdir(media,{recursive:true});await writeFile(join(media,"input.mp4"),"fixture");const calls=[],adapters=createProfessionalMediaAdapters({repoRoot:root,run:(command,args)=>{calls.push({command,args});return{status:0,stdout:JSON.stringify({format:{format_name:"mp4",duration:"1.0"},streams:[{index:0,codec_type:"video",codec_name:"h264",width:1920,height:1080,secret:"drop"}]})};}}),result=await adapters["media-quality-control"]({request:{inputPath:"runtime/artifacts/media/input.mp4"}});assert.deepEqual(implementedProfessionalAdapterIds,["hyperframes-artifact-adapter-v1","remotion-artifact-adapter-v1","video-use-artifact-adapter-v1","manim-artifact-adapter-v1","blender-digital-human-adapter-v1","kling-ai-video-adapter-v1","ffmpeg-quality-adapter-v1"]);assert.equal(calls[0].command,"ffprobe");assert.match(result.artifacts[0].content,/"codecName": "h264"/);assert.doesNotMatch(result.artifacts[0].content,/secret/);await writeFile(join(root,"outside.mp4"),"fixture");await assert.rejects(()=>adapters["media-quality-control"]({request:{inputPath:"outside.mp4"}}),error=>error.code==="MEDIA_INPUT_PATH_BLOCKED");});

test("Kling route resolves only through its credential-scoped provider profile",async()=>{const registry=new ProfessionalRunnerCapabilityRegistry({credentialReferenceIds:["kling-api-key-ref"],registeredAdapterIds:implementedProfessionalAdapterIds}),result=await registry.matchTask({id:"kling-1",title:"使用海外版 Kling 可灵首尾帧生成视频"});assert.equal(result.rule.rule_id,"RULE-KLING-AI-VIDEO");assert.equal(result.capability.profile_id,"media-ai-video-kling");assert.equal(result.capability.execution_readiness,"NOT_EXECUTABLE");assert.ok(result.capability.blocked_reasons.includes("RUNNER_NOT_ACTIVATED:media-ai-video-kling"));});

test("Kling adapter exposes an offline preview and blocks plans outside media artifacts",async()=>{const root=await mkdtemp(join(tmpdir(),"kling-adapter-")),media=join(root,"runtime/artifacts/media"),output=join(media,"execution");await mkdir(output,{recursive:true});const plan=join(media,"plan.json");await writeFile(plan,"{}");const calls=[],adapter=createKlingAiVideoAdapter({repoRoot:root,run:async(command,args,options)=>{calls.push({command,args,options});return{code:0,stdout:'{\"status\":\"DRY_RUN\",\"credentialValueRead\":false}',stderr:""};}}),result=await adapter({request:{operation:"CHECK",planPath:"runtime/artifacts/media/plan.json"},outputRoot:output});assert.equal(result.status,"CHECKED_AWAITING_PROVIDER_APPROVAL");assert.equal(calls[0].args.includes("--dry-run"),true);assert.equal(JSON.parse(result.artifacts[0].content).credentialValueRead,false);const outside=join(root,"outside-plan.json");await writeFile(outside,"{}");await assert.rejects(()=>adapter({request:{operation:"CHECK",planPath:"outside-plan.json"},outputRoot:output}),error=>error.code==="KLING_PLAN_PATH_BLOCKED");});

test("Blender digital-human adapter exposes governed printable refinement without external credentials",async()=>{
  const root=await mkdtemp(join(tmpdir(),"printable-adapter-"));
  const media=join(root,"runtime/artifacts/media");
  const workspace=join(root,"runtime/workspaces/media/character");
  const output=join(media,"execution");
  await mkdir(workspace,{recursive:true});
  await mkdir(output,{recursive:true});
  const mesh=join(media,"candidate.glb");
  const manifest=join(workspace,"multiview.json");
  await writeFile(mesh,"mesh");
  await writeFile(manifest,"{}");
  const calls=[];
  const adapter=createBlenderDigitalHumanAdapter({
    repoRoot:root,
    run:async(_command,args)=>{
      calls.push(args);
      const outputIndex=args.indexOf("--output");
      const target=args[outputIndex+1];
      const files=["asset-refined.glb","asset-base.stl","asset-assembly.stl","asset-refined.blend","color.jpg","clay.jpg","silhouette.jpg","printability.json","silhouette.json","package.json"];
      await Promise.all(files.map(name=>writeFile(join(target,name),name)));
      return{
        code:0,
        stderr:"",
        stdout:JSON.stringify({
          status:"REVIEW_READY",
          gates:{geometry:"PASS_WITH_CONDITIONS",silhouette:"PASS",physicalPrintProof:"REQUIRED_BEFORE_FINAL_RELEASE"},
          metrics:{frontIou:0.86},
          packageManifest:join(target,"package.json"),
          artifacts:{
            refinedGlb:join(target,"asset-refined.glb"),
            baseStl:join(target,"asset-base.stl"),
            assemblyStl:join(target,"asset-assembly.stl"),
            blenderSource:join(target,"asset-refined.blend"),
            colorTurntableContactSheet:join(target,"color.jpg"),
            clayTurntableContactSheet:join(target,"clay.jpg"),
            silhouetteContactSheet:join(target,"silhouette.jpg"),
            printabilityReport:join(target,"printability.json"),
            silhouetteReport:join(target,"silhouette.json")
          }
        })
      };
    }
  });
  const result=await adapter({
    request:{
      operation:"REFINE_PRINTABLE",
      meshPath:"runtime/artifacts/media/candidate.glb",
      manifestPath:"runtime/workspaces/media/character/multiview.json",
      assetId:"asset",
      surfaceMethod:"voxel",
      surfaceSubdivisionLevel:2
    },
    outputRoot:output
  });
  assert.equal(result.status,"REVIEW_READY");
  assert.equal(result.externalModelCalled,false);
  assert.equal(result.credentialValueRead,false);
  assert.equal(result.artifacts.length,10);
  assert.equal(calls[0].includes("refine-printable"),true);
  assert.deepEqual(
    calls[0].slice(calls[0].indexOf("--surface-subdivision-level"),calls[0].indexOf("--surface-subdivision-level")+4),
    ["--surface-subdivision-level","2","--surface-method","voxel"]
  );
  const outside=join(root,"outside.glb");
  await writeFile(outside,"mesh");
  await assert.rejects(()=>adapter({
    request:{operation:"REFINE_PRINTABLE",meshPath:"outside.glb",manifestPath:"runtime/workspaces/media/character/multiview.json"},
    outputRoot:output
  }),error=>error.code==="PRINTABLE_MESH_PATH_BLOCKED");
});

test("offline footage editing and credential-scoped transcription have independent readiness",async()=>{const registry=new ProfessionalRunnerCapabilityRegistry({registeredAdapterIds:implementedProfessionalAdapterIds}),inventory=await registry.inventory(),editing=inventory.profiles.find(item=>item.profile_id==="media-footage-video-use"),transcription=inventory.profiles.find(item=>item.profile_id==="media-transcription-video-use");assert.equal(editing.installation_readiness,"READY");assert.ok(!editing.blocked_reasons.some(reason=>reason.startsWith("CREDENTIAL_REFERENCE_MISSING")));assert.equal(transcription.installation_readiness,"NOT_READY");assert.ok(transcription.blocked_reasons.includes("CREDENTIAL_REFERENCE_MISSING:media-transcription-provider-ref"));});

test("video-use adapter requires an explicit confirmed strategy before touching footage",async()=>{const adapters=createProfessionalMediaAdapters({repoRoot:process.cwd()});await assert.rejects(()=>adapters["media-footage-video-use"]({request:{sourceHasSpeech:false},outputRoot:"runtime/artifacts/media/test"}),error=>error.code==="VIDEO_USE_STRATEGY_CONFIRMATION_REQUIRED");});

test("HyperFrames adapter gates check and render with pinned project and consumed approval",async()=>{const root=await mkdtemp(join(tmpdir(),"hyperframes-adapter-")),project=join(root,"runtime/workspaces/media/project-1"),output=join(root,"runtime/artifacts/media/exec-1");await mkdir(project,{recursive:true});await mkdir(output,{recursive:true});await writeFile(join(project,"BRIEF.md"),"---\nworkflow: motion-graphics\nflow: automation\nstoryboard: no\n---\n");await writeFile(join(project,"index.html"),"<html></html>");await writeFile(join(project,"package.json"),JSON.stringify({devDependencies:{hyperframes:"0.7.65"}}));const calls=[],run=async(_binary,args)=>{calls.push(args);if(args[0]==="check")return{code:0,stdout:JSON.stringify({ok:true,lint:{errors:[]}}),stderr:""};await writeFile(args.at(-1),"video");return{code:0,stdout:"",stderr:""};},adapter=createHyperframesArtifactAdapter({repoRoot:root,run}),base={projectRoot:"runtime/workspaces/media/project-1",taskId:"task-1",attemptId:"attempt-1",profileId:"media-generative-hyperframes",maxRuntimeMs:1000};const checked=await adapter({request:{...base,operation:"CHECK"},outputRoot:output});assert.equal(checked.status,"CHECKED_AWAITING_RENDER_APPROVAL");assert.equal(calls[0][0],"check");await assert.rejects(()=>adapter({request:{...base,operation:"RENDER"},outputRoot:output}),error=>error.code==="HYPERFRAMES_RENDER_APPROVAL_REQUIRED");const rendered=await adapter({request:{...base,operation:"RENDER",renderApproval:{status:"CONSUMED",taskId:"task-1",attemptId:"attempt-1",profileId:"media-generative-hyperframes"}},outputRoot:output});assert.equal(rendered.status,"SUCCEEDED");assert.equal(rendered.artifacts[0].sourcePath,join(output,"render.mp4"));});

test("HyperFrames deny-by-default adapter rejects external resources",async()=>{const root=await mkdtemp(join(tmpdir(),"hf-network-")),project=join(root,"runtime/workspaces/media/project"),output=join(root,"runtime/artifacts/media/out");await mkdir(project,{recursive:true});await mkdir(output,{recursive:true});await writeFile(join(project,"BRIEF.md"),"# brief");await writeFile(join(project,"package.json"),JSON.stringify({scripts:{render:"hyperframes@0.7.65 render"}}));await writeFile(join(project,"index.html"),'<script src="https://example.com/a.js"></script>');const adapter=createHyperframesArtifactAdapter({repoRoot:root,run:async()=>({code:0,stdout:'{"ok":true}',stderr:""})});await assert.rejects(()=>adapter({request:{projectRoot:"runtime/workspaces/media/project",operation:"CHECK"},outputRoot:output}),error=>error.code==="HYPERFRAMES_EXTERNAL_RESOURCE_BLOCKED");});

test("kernel bridge preserves existing lease and fencing authority",async()=>{let current=true,released=null;const kernel={assertCurrent:async()=>{if(!current)throw Object.assign(new Error("FENCING_REJECTED"),{code:"FENCING_REJECTED"});},releaseLease:async(proof,result)=>{released={proof,result};}},executionService={execute:async()=>({status:"SUCCEEDED",executionId:"exec-1",manifest:{artifacts:[{name:"render.mp4"}]}})},bridge=new ProfessionalRunnerKernelBridge({kernel,executionService}),claim={taskId:"t",attemptId:"a",leaseId:"l",leaseToken:"lease-secret",fencingToken:7,workerId:"w",sessionId:"s",expectedVersion:1};const result=await bridge.execute({claim,request:{profileId:"media-generative-hyperframes"}});assert.equal(result.status,"SUCCEEDED");assert.equal(released.result.validationResult.fencingValidated,true);assert.equal(released.result.taskStatus,"SUCCEEDED");current=false;await assert.rejects(()=>bridge.execute({claim,request:{}}),error=>error.code==="FENCING_REJECTED");});

test("artifact projection exposes sanitized console evidence only",async()=>{const root=await mkdtemp(join(tmpdir(),"artifact-projection-")),dir=join(root,"runtime/artifacts/media/exec-1");await mkdir(dir,{recursive:true});await writeFile(join(dir,"artifact-manifest.json"),JSON.stringify({executionId:"exec-1",taskId:"task-1",profileId:"media-generative-hyperframes",capabilityVersion:"1.0.0",status:"SUCCEEDED",completedAt:"2026-07-21T00:00:00Z",artifacts:[{name:"render.mp4",mediaType:"video/mp4",bytes:10,sha256:"abc",relativePath:"secret/path"}]}));const projection=await projectProfessionalArtifacts({repoRoot:root});assert.equal(projection.summary.succeeded,1);assert.equal(projection.items[0].artifacts[0].name,"render.mp4");assert.equal("relativePath" in projection.items[0].artifacts[0],false);});
