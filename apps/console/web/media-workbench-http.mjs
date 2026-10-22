// Console retains authentication and session resolution; these handlers enforce media scope and object access.
export async function handleMediaWorkbenchPublic({request,response,pathname,accessContext,mediaWorkbench,sendJson,sendCapabilityArtifact,requireSameOrigin,readJsonBody,readRawBody,evaluateConsoleRouteAccess}) {
    if(pathname.startsWith("/api/media-workbench/")) {
      try {
        const access=evaluateConsoleRouteAccess("video",accessContext);if(!access.allowed){sendJson(response,403,access);return;}
        if(!["GET","HEAD"].includes(request.method)&&!requireSameOrigin(request)){sendJson(response,403,{status:"SAME_ORIGIN_REQUIRED"});return;}
        const match=pathname.match(/^\/api\/media-workbench\/projects\/([^/]+)(.*)$/);if(!match){sendJson(response,404,{status:"MEDIA_ROUTE_NOT_FOUND"});return;}
        const actor=mediaWorkbench.actor(accessContext,decodeURIComponent(match[1])),tail=match[2];
        if(!["GET","HEAD"].includes(request.method)&&!accessContext.capabilities?.some(x=>["*","business.work.control","business.manage"].includes(x))){sendJson(response,403,{status:"MEDIA_WRITE_FORBIDDEN"});return;}
        const artifact=tail.match(/^\/artifacts\/([^/]+)$/),chunk=tail.match(/^\/uploads\/([^/]+)\/chunks\/(\d+)$/),complete=tail.match(/^\/uploads\/([^/]+)\/complete$/),select=tail.match(/^\/runs\/([^/]+)\/select$/);
        if(request.method==="GET"&&tail==="/state"){sendJson(response,200,await mediaWorkbench.dashboard(actor));return;}
        if(["GET","HEAD"].includes(request.method)&&artifact){sendCapabilityArtifact(request,response,await mediaWorkbench.artifact(actor,artifact[1]));return;}
        if(request.method==="POST"&&tail==="/uploads"){sendJson(response,201,await mediaWorkbench.initialize(actor,await readJsonBody(request)));return;}
        if(request.method==="PUT"&&chunk){sendJson(response,200,await mediaWorkbench.chunk(actor,chunk[1],chunk[2],await readRawBody(request)));return;}
        if(request.method==="POST"&&complete){sendJson(response,200,await mediaWorkbench.complete(actor,complete[1]));return;}
        if(request.method==="POST"&&tail==="/runs"){sendJson(response,201,await mediaWorkbench.submit(actor,await readJsonBody(request)));return;}
        if(request.method==="POST"&&select){sendJson(response,200,await mediaWorkbench.selected(actor,select[1],(await readJsonBody(request)).variant));return;}
        sendJson(response,404,{status:"MEDIA_ROUTE_NOT_FOUND"});return;
      }catch(error){sendJson(response,error.status??400,{status:error.code??"MEDIA_REQUEST_FAILED",reason:error.message});return;}
    }
}

export async function handleMediaWorkbenchWorker({request,response,pathname,mediaWorkbench,sendJson,sendCapabilityArtifact,readJsonBody,readRawBody}) {
        const mediaRoute = pathname.match(/^\/api\/resident-workers\/([^/]+)\/media(?:\/tasks\/([^/]+))?(.*)$/);
        if (mediaRoute) {
          if (!mediaWorkbench.enabled) { sendJson(response,503,{status:"MEDIA_WORKBENCH_DISABLED"});return; }
          const [,workerId,taskId,tail]=mediaRoute;
          const leaseInput={leaseToken:request.headers["x-media-lease"],fencingToken:Number(request.headers["x-media-fencing"])};
          if (workerId!==mediaWorkbench.workerId) {sendJson(response,403,{status:"MEDIA_WORKER_FORBIDDEN"});return;}
          if(request.method==="POST"&&!taskId&&tail==="/catalog"){await mediaWorkbench.catalog(await readJsonBody(request));sendJson(response,200,{status:"OK"});return;}
          const asset=tail.match(/^\/assets\/([^/]+)$/),chunk=tail.match(/^\/outputs\/([^/]+)\/chunks\/(\d+)$/),done=tail.match(/^\/outputs\/([^/]+)\/complete$/);
          if(request.method==="GET"&&asset){sendCapabilityArtifact(request,response,await mediaWorkbench.workerAsset(workerId,taskId,leaseInput,asset[1]));return;}
          if(request.method==="POST"&&tail==="/outputs"){sendJson(response,201,await mediaWorkbench.workerOutput(workerId,taskId,{...await readJsonBody(request),...leaseInput}));return;}
          if(request.method==="PUT"&&chunk){sendJson(response,200,await mediaWorkbench.workerChunk(workerId,taskId,leaseInput,chunk[1],chunk[2],await readRawBody(request)));return;}
          if(request.method==="POST"&&done){sendJson(response,200,await mediaWorkbench.workerCompleteUpload(workerId,taskId,leaseInput,done[1]));return;}
          sendJson(response,404,{status:"MEDIA_WORKER_ROUTE_NOT_FOUND"});return;
        }
}

// The legacy Codex control surface must never become an alternate reader for private media inputs/results.
export function projectResidentControlWithoutMedia(dashboard) { return { ...dashboard, tasks: dashboard.tasks.filter(task => task.kind !== "MEDIA") }; }
