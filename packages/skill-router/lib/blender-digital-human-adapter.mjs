import { access, realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { runProfessionalProcess } from "./professional-process.mjs";

const fail=(code,message=code)=>Object.assign(new Error(message),{code});

export function createBlenderDigitalHumanAdapter({repoRoot=process.cwd(),run=runProfessionalProcess}={}){
  const root=resolve(repoRoot);
  const workspaceRoot=resolve(root,"runtime/workspaces/media");
  const artifactRoot=resolve(root,"runtime/artifacts/media");
  const cli=resolve(root,"packages/digital-human-pipeline/bin/digital-human-pipeline.mjs");
  return async({request,outputRoot})=>{
    const operation=String(request.operation??"CHECK").toUpperCase();
    if(operation==="BUILD_PARAMETRIC_PRINTABLE"){
      const [spec,manifest,allowedWorkspace,allowedArtifacts,output]=await Promise.all([
        realpath(resolve(root,request.specPath??"")),
        realpath(resolve(root,request.manifestPath??"")),
        realpath(workspaceRoot),
        realpath(artifactRoot),
        realpath(outputRoot)
      ]);
      const modelingRoot=await realpath(resolve(root,"packages/3d-modeling-domain"));
      if(!(spec===modelingRoot||spec.startsWith(`${modelingRoot}/`)))throw fail("PARAMETRIC_SPEC_PATH_BLOCKED");
      if(!(manifest===allowedWorkspace||manifest.startsWith(`${allowedWorkspace}/`)))throw fail("PARAMETRIC_MANIFEST_PATH_BLOCKED");
      if(!(output===allowedArtifacts||output.startsWith(`${allowedArtifacts}/`)))throw fail("PARAMETRIC_OUTPUT_PATH_BLOCKED");
      const timeoutMs=Math.min(Number(request.maxRuntimeMs??3600000),3600000);
      const result=await run(process.execPath,[
        cli,
        "build-parametric-printable",
        "--spec",spec,
        "--output",output,
        "--weld-method",String(request.weldMethod??"assembly-only")
      ],{
        cwd:root,
        timeoutMs,
        signal:request.signal,
        env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",DO_NOT_TRACK:"1",CI:"1"}
      });
      if(result.code!==0)throw fail("PARAMETRIC_CHARACTER_BUILD_FAILED");
      let report;
      try{report=JSON.parse(result.stdout);}catch{throw fail("PARAMETRIC_CHARACTER_OUTPUT_INVALID");}
      const artifacts=[];
      for(const sourcePath of Object.values(report.artifacts??{})){
        let file;
        try{file=await realpath(sourcePath);}catch{continue;}
        if(!(file===output||file.startsWith(`${output}/`)))throw fail("PARAMETRIC_ARTIFACT_PATH_BLOCKED");
        if(!(await stat(file)).isFile())continue;
        const name=file.slice(output.length+1);
        const mediaType=name.endsWith(".glb")?"model/gltf-binary":name.endsWith(".blend")?"application/x-blender":"application/json";
        artifacts.push({name,mediaType,sourcePath:file});
      }
      return{
        status:report.status,
        constructionMode:report.constructionMode,
        authoritativeMaster:report.authoritativeMaster,
        manufacturingUnionStatus:report.manufacturingUnionStatus,
        semanticPartCount:report.semanticPartCount,
        externalModelCalled:false,
        credentialValueRead:false,
        artifacts
      };
    }
    if(operation==="REFINE_PRINTABLE"){
      const [mesh,manifest,allowedWorkspace,allowedArtifacts,output]=await Promise.all([
        realpath(resolve(root,request.meshPath??"")),
        realpath(resolve(root,request.manifestPath??"")),
        realpath(workspaceRoot),
        realpath(artifactRoot),
        realpath(outputRoot)
      ]);
      if(!(mesh===allowedArtifacts||mesh.startsWith(`${allowedArtifacts}/`)))throw fail("PRINTABLE_MESH_PATH_BLOCKED");
      if(!(manifest===allowedWorkspace||manifest.startsWith(`${allowedWorkspace}/`)))throw fail("PRINTABLE_MANIFEST_PATH_BLOCKED");
      if(!(output===allowedArtifacts||output.startsWith(`${allowedArtifacts}/`)))throw fail("PRINTABLE_OUTPUT_PATH_BLOCKED");
      const timeoutMs=Math.min(Number(request.maxRuntimeMs??3600000),3600000);
      const result=await run(process.execPath,[
        cli,
        "refine-printable",
        "--mesh",mesh,
        "--manifest",manifest,
        "--asset-id",String(request.assetId??"printable-character"),
        "--target-height-mm",String(request.targetHeightMm??180),
        "--surface-subdivision-level",String(request.surfaceSubdivisionLevel??1),
        "--surface-method",String(request.surfaceMethod??"voxel"),
        "--surface-profile",String(request.surfaceProfile??"feature-preserving"),
        "--feature-angle-degrees",String(request.featureAngleDegrees??60),
        "--feature-protection-rings",String(request.featureProtectionRings??1),
        "--resolution",String(request.reviewResolution??768),
        "--output",output
      ],{
        cwd:root,
        timeoutMs,
        signal:request.signal,
        env:{PATH:process.env.PATH??"",HOME:process.env.HOME??"",DO_NOT_TRACK:"1",CI:"1"}
      });
      if(result.code!==0)throw fail("DIGITAL_HUMAN_PRINTABLE_REFINEMENT_FAILED");
      let report;
      try{report=JSON.parse(result.stdout);}catch{throw fail("DIGITAL_HUMAN_PRINTABLE_OUTPUT_INVALID");}
      const artifactCandidates=[
        report.packageManifest,
        report.artifacts?.refinedGlb,
        report.artifacts?.baseStl,
        report.artifacts?.assemblyStl,
        report.artifacts?.blenderSource,
        report.artifacts?.colorTurntableContactSheet,
        report.artifacts?.clayTurntableContactSheet,
        report.artifacts?.silhouetteContactSheet,
        report.artifacts?.printabilityReport,
        report.artifacts?.silhouetteReport
      ].filter(Boolean);
      const artifacts=[];
      for(const sourcePath of artifactCandidates){
        const file=await realpath(sourcePath);
        if(!(file===output||file.startsWith(`${output}/`)))throw fail("PRINTABLE_ARTIFACT_PATH_BLOCKED");
        if(!(await stat(file)).isFile())continue;
        const name=file.slice(output.length+1);
        const mediaType=name.endsWith(".glb")?"model/gltf-binary":name.endsWith(".stl")?"model/stl":name.endsWith(".blend")?"application/x-blender":name.endsWith(".jpg")?"image/jpeg":"application/json";
        artifacts.push({name,mediaType,sourcePath:file});
      }
      return{
        status:report.status,
        gates:report.gates,
        metrics:report.metrics,
        externalModelCalled:false,
        credentialValueRead:false,
        artifacts
      };
    }
    const project=await realpath(resolve(root,request.projectRoot??""));
    const allowed=await realpath(workspaceRoot);
    if(!(project===allowed||project.startsWith(`${allowed}/`)))throw fail("DIGITAL_HUMAN_PROJECT_ROOT_BLOCKED");
    for(const name of ["characters.json","scene.json","story.json"]){
      try{await access(resolve(project,name));}catch{throw fail(`DIGITAL_HUMAN_PROJECT_FILE_MISSING:${name}`);}
    }
    const timeoutMs=Math.min(Number(request.maxRuntimeMs??3600000),3600000);
    const baseArgs=[cli];
    const env={
      PATH:process.env.PATH??"",
      HOME:process.env.HOME??"",
      DO_NOT_TRACK:"1",
      CI:"1"
    };
    if(operation==="CHECK"){
      const result=await run(process.execPath,[...baseArgs,"validate","--project",project],{
        cwd:root,timeoutMs,signal:request.signal,env
      });
      if(result.code!==0)throw fail("DIGITAL_HUMAN_CHECK_FAILED");
      let report;
      try{report=JSON.parse(result.stdout);}catch{throw fail("DIGITAL_HUMAN_CHECK_OUTPUT_INVALID");}
      return{
        status:"CHECKED_AWAITING_RENDER_APPROVAL",
        artifacts:[{name:"digital-human-check.json",mediaType:"application/json",content:`${JSON.stringify(report,null,2)}\n`}]
      };
    }
    if(operation!=="RENDER")throw fail("DIGITAL_HUMAN_OPERATION_BLOCKED");
    const approval=request.renderApproval;
    if(!approval||approval.status!=="CONSUMED"||approval.taskId!==request.taskId||approval.attemptId!==request.attemptId||approval.profileId!==request.profileId){
      throw fail("DIGITAL_HUMAN_RENDER_APPROVAL_REQUIRED");
    }
    const result=await run(process.execPath,[...baseArgs,"render","--project",project,"--output",outputRoot],{
      cwd:root,timeoutMs,signal:request.signal,env
    });
    if(result.code!==0)throw fail("DIGITAL_HUMAN_RENDER_FAILED");
    let report;
    try{report=JSON.parse(result.stdout);}catch{throw fail("DIGITAL_HUMAN_RENDER_OUTPUT_INVALID");}
    const artifacts=[];
    for(const name of report.artifacts??[]){
      const sourcePath=resolve(outputRoot,name);
      await access(sourcePath);
      artifacts.push({
        name,
        mediaType:name.endsWith(".mp4")?"video/mp4":name.endsWith(".glb")?"model/gltf-binary":name.endsWith(".blend")?"application/x-blender":name.endsWith(".jpg")?"image/jpeg":"application/json",
        sourcePath
      });
    }
    return{status:"SUCCEEDED",artifacts};
  };
}
