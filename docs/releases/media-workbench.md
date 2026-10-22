# 影音工作台

入口 `/video/workbench`，复用原视频工厂访问权限；原 `/video` 业务页保留。
默认关闭。启用需要 `STUDIO_MEDIA_WORKBENCH_ENABLED=true`、明确的
`STUDIO_MEDIA_PROJECT_IDS`（逗号分隔）与可选 `STUDIO_MEDIA_WORKER_ID=mac-media-1`。
写操作还需要原有 business.work.control 或 business.manage 权限。

运行 metadata 在 runtime/media-workbench，上传与产物通过 UUID 标识，逐对象校验当前
organization/workspace/project/user。原文件、人声、参考片段、生成结果独立保存，不入 Git。
音色和参数不使用本机 global preferences；已有私人音色不会自动迁移。

Mac 执行器使用既有 ResidentWorkerBroker 的任务、租约、fencing 和结果回调；仅指定 worker
领取 MEDIA 类型，不领取 Codex 任务，原 Codex Worker 不领取媒体任务。没有第二个 Studio
任务状态机。执行器把固定操作交给既有 loopback 8189 管理的本地应用，不开放本机端口。
本地应用仍负责已有模型资源互斥。worker 日志不记录音频、正文、凭据或私有路径。
同一媒体执行器只能启动一个进程，本地 journal 关联已提交请求，网络恢复不重复推理。

Mac 配置（0600）默认 `~/.anksen-agent-studio/media-device.json`：
baseUrl, workerId, projectIds, tokenFile（引用既有 resident worker 凭据文件）, stateRoot。
启动 `node packages/managed-capability-apps/bin/media-device.mjs`。
设备离线不接受新任务。排队最多四个媒体任务；本机其他生成任务不会被中断或清理。

声音模型字段从实际设备接口同步；支持全部推理字段，加载结构由原模型只读管理。
H3 使用本地已验证的固定 8 步工作流，24fps，保留生成音轨；可设置提示词、声音描述、参考图、
分辨率、时长档与种子。未实现的工作流调整不会伪装成可用参数。

## 本次发布

Main push 只验证，生产 deploy job 仅 workflow_dispatch 触发。为避免原全栈发布脚本
顺带重部署其他业务，本次使用 scripts/deploy-console-media.sh --commit FULL_SHA，
其操作仅限 Studio git fast-forward、安装/检查/构建和 Console 服务重启；通过新增 STUDIO_BUSINESS_SCHEMA_INIT=false 禁用既有 Console 启动时的自动 schema 初始化，不运行数据库迁移，
不发布身份服务、OpenMontage 或 OpenClaw。与原脚本共用发布锁。新增 `/health/version`
返回进程启动时绑定的 Git SHA、时间及PID，供实际运行版本验收。

## 回退

先将新增 systemd drop-in 的 STUDIO_MEDIA_WORKBENCH_ENABLED 改为 false，重载并重启
Console，隐藏新入口并拒绝新请求。停止独立媒体执行器前先等当前任务结束；不要清理共享
ComfyUI 队列。保留 runtime/global/access-users.json、素材和所有既有业务数据。
需要回退应用源码时明确指定上一个已验证 SHA，并在发布锁内切换、构建和重启；不运行
reset --hard、clean 或数据库回滚。新增元数据不删除，旧代码可以忽略它。
