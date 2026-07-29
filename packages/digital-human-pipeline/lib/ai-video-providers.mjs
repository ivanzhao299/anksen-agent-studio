const officialKlingDocs = {
  overview: "https://kling.ai/document-api/guides/get-started/overview",
  quickStart: "https://kling.ai/document-api/guides/get-started/quick-start",
  imageToVideo: "https://kling.ai/document-api/api/video/3-0-omni/image-to-video",
  video3Guide: "https://app.klingai.com/cn/quickstart/klingai-video-3-model-user-guide"
};

export const aiVideoProviders = {
  "kling-ai": {
    providerId: "kling-ai",
    displayName: "可灵 AI",
    providerType: "external-ai-video",
    apiProfile: "kling-overseas-v3",
    apiBase: "https://api-singapore.klingai.com",
    createPath: "/image-to-video/kling-3.0",
    taskPath: "/tasks",
    credentialReferenceRequired: true,
    storesCredentialValue: false,
    officialDocs: officialKlingDocs,
    capabilities: {
      startEndFrames: true,
      elementReferences: true,
      multiImageReferences: true,
      nativeAudio: true,
      multiShot: true,
      maximumDurationSeconds: 15,
      supportedResolutions: ["720p", "1080p", "4k"]
    }
  }
};

export function buildAiVideoDispatchPlan({
  providerId,
  projectRoot,
  outputRoot,
  frameReport,
  story,
  characters = [],
  elementReferences
}) {
  const provider = aiVideoProviders[providerId];
  if (!provider) {
    const error = new Error("AI_VIDEO_PROVIDER_UNKNOWN");
    error.code = "AI_VIDEO_PROVIDER_UNKNOWN";
    error.details = { providerId };
    throw error;
  }
  if (story.duration > provider.capabilities.maximumDurationSeconds) {
    const error = new Error("AI_VIDEO_DURATION_UNSUPPORTED");
    error.code = "AI_VIDEO_DURATION_UNSUPPORTED";
    error.details = { providerId, duration: story.duration };
    throw error;
  }
  const shot = story.shots[0];
  const dialogue = story.dialogue[0];
  const primaryCharacter = characters[0] ?? {};
  const identityFeatures = Array.isArray(primaryCharacter.identityFeatures)
    ? primaryCharacter.identityFeatures
    : [];
  const prohibitedIdentityFeatures = Array.isArray(primaryCharacter.prohibitedIdentityFeatures)
    ? primaryCharacter.prohibitedIdentityFeatures
    : [];
  const identityPrompt = identityFeatures.length
    ? `保持${primaryCharacter.displayName ?? "主角"}的身份完全一致：${identityFeatures.join("；")}。`
    : "保持主角的造型、比例、材质和品牌标识完全一致。";
  const backgroundLocked = Boolean(shot?.composition?.backgroundLock);
  const portrait = Number(story.resolution?.height) > Number(story.resolution?.width);
  const defaultMotionTimeline = [
    {
      range: "0.0-1.2s",
      action: "灰灰稳定站立，胸腔轻微呼吸，眼睛自然眨动一次，双脚固定接触地面。"
    },
    {
      range: "1.2-3.8s",
      action: "灰灰转头约十五度看向镜头，右手从身体侧面自然抬起并挥手两次，手指动作完整。"
    },
    {
      range: "3.8-6.0s",
      action: backgroundLocked
        ? "小灰灰说完台词后右手缓慢放下，身体回正；相机、道路、建筑和树木保持完全固定。"
        : "灰灰说完台词后右手缓慢放下，身体回正，保持稳定站姿，镜头轻微向前推进。"
    }
  ];
  const motionTimeline = Array.isArray(story.motionTimeline) && story.motionTimeline.length
    ? story.motionTimeline
    : defaultMotionTimeline;
  const voicePrompt = story.audio?.voicePrompt
    ?? "14至16岁青少年男性声线，清亮、阳光、有朝气，带轻微童真和自然呼吸感，不低沉，不使用成年男性播音腔或机器合成腔";
  const ambientPrompt = story.audio?.ambientPrompt;
  const environmentMotionPrompt = story.environmentMotionPrompt;
  const storyNegativePromptTerms = Array.isArray(story.negativePromptTerms)
    ? story.negativePromptTerms
    : [];
  const prompt = [
    identityPrompt,
    prohibitedIdentityFeatures.length
      ? `禁止出现旧版或错误身份元素：${prohibitedIdentityFeatures.join("、")}。`
      : "",
    "水泥二厂文创园主路实景保持真实，人物脚底与道路接触稳定，无漂浮、无穿模、无额外肢体。",
    shot?.action ?? "",
    dialogue
      ? `从约 ${dialogue.start ?? 0} 秒开始，小灰灰用${voicePrompt}说：“${dialogue.text}”。语气亲切有感染力，语速自然，口型与语音准确同步。`
      : "",
    ambientPrompt ? `环境声音：${ambientPrompt}` : "",
    environmentMotionPrompt ? `环境运动约束：${environmentMotionPrompt}` : "",
    portrait ? "画面为手机竖屏 9:16 构图，人物全身始终位于安全画幅内。" : "",
    backgroundLocked
      ? "背景是一张已经重建完成的固定场景资产；禁止相机移动、背景平移、树木漂移、建筑变形和道路透视变化，只驱动小灰灰在道路上的位移、肢体动作、表情和口型。"
      : "",
    `动作节拍：${motionTimeline.map(item => `${item.range} ${item.action}`).join(" ")}`,
    "单镜头，中景，动作连续细腻，人物轮廓、比例和材质在全程保持稳定。"
  ]
    .filter(Boolean)
    .join(" ");
  const negativePrompt = [
    "角色变形",
    "安全帽文字变化",
    "多余肢体",
    "漂浮",
    "脚底滑动",
    "场景跳变",
    "画面闪烁",
    "错误文字",
    "通用机器人替代",
    "成年男性低沉嗓音",
    "播音腔",
    "机器人合成腔",
    ...(backgroundLocked ? ["背景移动", "镜头推进"] : ["剧烈摇镜", "镜头跳切", "建筑弯曲", "道路融化"]),
    ...storyNegativePromptTerms
  ].join(", ");

  return {
    schemaVersion: 1,
    jobId: `${story.storyId}-${providerId}-start-end-v1`,
    status: "AWAITING_APPROVAL_AND_CREDENTIAL_REFERENCE",
    executionMode: "external_provider",
    provider: {
      providerId,
      displayName: provider.displayName,
      modelFamily: "Kling Video 3.0",
      capability: "start-end-frame-to-video",
      officialDocs: provider.officialDocs
    },
    credentialReference: {
      type: "env_ref",
      reference: "kling-api-key-ref",
      environmentVariable: "KLING_API_KEY",
      valueRead: false,
      status: "REFERENCE_REQUIRED_FOR_SUBMISSION"
    },
    input: {
      projectRoot,
      startFrame: frameReport.startFrame,
      endFrame: frameReport.endFrame,
      elementReferences,
      prompt,
      negativePrompt,
      durationSeconds: story.duration,
      resolution: story.resolution,
      nativeAudio: Boolean(story.audio?.nativeAudio),
      backgroundLocked,
      motionTimeline,
      identityLock: {
        subject: primaryCharacter.assetId ?? "huihui",
        version: primaryCharacter.identityVersion ?? "unspecified",
        invariants: identityFeatures,
        prohibited: prohibitedIdentityFeatures
      }
    },
    providerRequestMapping: {
      contents: [
        { type: "prompt", text: "$merge(input.prompt,input.negativePrompt)" },
        { type: "first_frame", url: "$base64AtExecutionBoundary(input.startFrame)" },
        { type: "last_frame", url: "$base64AtExecutionBoundary(input.endFrame)" }
      ],
      settings: {
        resolution: "$mapResolution(input.resolution)",
        duration: "$input.durationSeconds",
        audio: "$mapBoolean(input.nativeAudio,native,off)",
        multi_shot: false
      },
      options: {
        external_task_id: "$jobId",
        watermark_info: { enabled: false }
      },
      elementReferences: {
        status: "NOT_SUBMITTED_WITHOUT_KLING_ELEMENT_IDS",
        localIdentityReferences: "$input.elementReferences"
      }
    },
    governance: {
      risk: "MEDIUM",
      externalModelCall: true,
      requiresCostApproval: true,
      requiresCredentialReference: true,
      automaticSubmissionAllowed: false
    },
    output: {
      artifactRoot: outputRoot,
      expectedVideo: "provider-result.mp4",
      auditRecord: "provider-submission-audit.json"
    },
    notes: [
      "This plan does not contain or read a provider secret.",
      "Submission remains blocked until a credential reference and cost approval are available.",
      "Chrome login state is not used for API authentication. The overseas Open Platform API uses a Bearer API key.",
      "The first and last frames are generated from the same locked character identity and consecutive real-scene frames.",
      "Extracted front, side and back images are identity references, not a watertight 3D model or hidden-surface reconstruction."
    ]
  };
}

export function buildOrbitReferenceDispatchPlan({
  workflow,
  authoritativeFront,
  outputRoot
}) {
  const provider = aiVideoProviders[workflow.provider];
  if (!provider) {
    const error = new Error("AI_VIDEO_PROVIDER_UNKNOWN");
    error.code = "AI_VIDEO_PROVIDER_UNKNOWN";
    error.details = { providerId: workflow.provider };
    throw error;
  }
  if (workflow.orbit.durationSeconds > provider.capabilities.maximumDurationSeconds) {
    const error = new Error("AI_VIDEO_DURATION_UNSUPPORTED");
    error.code = "AI_VIDEO_DURATION_UNSUPPORTED";
    throw error;
  }
  const prompt = [
    "以输入的高清正面角色为唯一身份母版，生成同一个角色在摄影棚中原地匀速顺时针旋转完整 360 度的建模参考视频。",
    "角色始终保持中性站姿，双脚位置、四肢姿势、身体比例、头盔、面屏、耳罩、胸牌、手套和靴子完全不变。",
    "相机严格固定在角色腰部高度，焦距、距离、曝光、背景和地平线不变；禁止推拉、摇移、变焦、切镜和透视跳变。",
    "优先呈现接近正交投影的产品转台效果，旋转速度恒定，0 度与 360 度首尾身份一致。",
    "纯中性浅灰背景，角色全身始终完整可见，脚底接触固定地面，轮廓边缘清晰，适合逐帧轮廓和特征点追踪。",
    "这是几何校准参考，不需要表演、说话、眨眼、挥手、布料运动或环境特效。"
  ].join(" ");
  const negativePrompt = [
    "身份漂移",
    "体型变化",
    "肢体变长",
    "肢体变短",
    "多余肢体",
    "手指数变化",
    "头盔文字变化",
    "胸牌变化",
    "面屏表情变化",
    "材质变化",
    "镜头移动",
    "镜头变焦",
    "背景变化",
    "脚底滑动",
    "漂浮",
    "遮挡",
    "跳帧",
    "闪烁",
    "运动模糊"
  ].join(", ");
  return {
    schemaVersion: 1,
    jobId: `${workflow.workflowId}-kling-orbit-v1`,
    status: "AWAITING_APPROVAL_AND_CREDENTIAL_REFERENCE",
    executionMode: "external_provider",
    provider: {
      providerId: workflow.provider,
      displayName: provider.displayName,
      modelFamily: "Kling Video 3.0",
      capability: "identity-locked-orbit-reference",
      officialDocs: provider.officialDocs
    },
    credentialReference: {
      type: "keychain_ref",
      reference: "kling-api-key-ref",
      valueRead: false,
      status: "REFERENCE_REQUIRED_FOR_SUBMISSION"
    },
    input: {
      projectRoot: null,
      startFrame: authoritativeFront,
      endFrame: authoritativeFront,
      elementReferences: [authoritativeFront],
      prompt,
      negativePrompt,
      durationSeconds: workflow.orbit.durationSeconds,
      resolution: { width: 1080, height: 1080 },
      nativeAudio: false,
      orbitCalibration: {
        expectedDegrees: workflow.orbit.expectedDegrees,
        sampleAngles: workflow.orbit.sampleAngles,
        fixedCamera: workflow.orbit.fixedCamera,
        neutralPose: workflow.orbit.neutralPose,
        generatedFramesAreMetric: false
      },
      identityLock: {
        subject: workflow.assetId,
        version: "authoritative-front-v1",
        invariants: [
          "overall silhouette and compact body ratio",
          "helmet, face panel, ears, arms, hands, legs and boots",
          "all branding geometry and text placement",
          "surface material classes and color boundaries"
        ],
        prohibited: [
          "alternate robot design",
          "adult human proportions",
          "new symbols or lettering",
          "pose or expression changes"
        ]
      }
    },
    providerRequestMapping: {
      contents: [
        { type: "prompt", text: "$merge(input.prompt,input.negativePrompt)" },
        { type: "first_frame", url: "$base64AtExecutionBoundary(input.startFrame)" },
        { type: "last_frame", url: "$base64AtExecutionBoundary(input.endFrame)" }
      ],
      settings: {
        resolution: "1080p",
        duration: "$input.durationSeconds",
        audio: "off",
        multi_shot: false
      },
      options: {
        external_task_id: "$jobId",
        watermark_info: { enabled: false }
      }
    },
    governance: {
      risk: workflow.riskLevel,
      externalModelCall: true,
      requiresCostApproval: true,
      requiresCredentialReference: true,
      automaticSubmissionAllowed: false
    },
    output: {
      artifactRoot: outputRoot,
      expectedVideo: "provider-orbit-reference.mp4",
      auditRecord: "provider-orbit-submission-audit.json"
    },
    notes: [
      "The authoritative front remains the identity and frontal proportion master.",
      "The generated orbit is a non-metric pseudo-multiview observation source.",
      "Every extracted frame must pass drift rejection before fitting.",
      "The provider plan does not read or persist a secret.",
      "A fitted parameter proposal cannot overwrite the semantic master automatically."
    ]
  };
}
