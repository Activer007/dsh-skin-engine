# 10 · Codex Task Backlog

每个任务都应独立形成可 Review 的变更。任务中的路径是建议结构，Codex 必须先检查实际仓库后再调整。

## M0 · Host Audit

### T0-01 · DSH Plugin / Host API Recon
- **目标**：查清目标 DSH 版本的插件入口、Host / Browser 分工、路由注册、设置存储、资源注入和卸载机制。
- **产出**：`docs/host-audit.md`、可用 API 清单、未知项清单。
- **验收**：每个 API 有源码路径或运行时验证证据；不以猜测补齐。

### T0-02 · Host Token / Surface Map
- **目标**：检查当前 DSH 版本的 CSS Variables、稳定 data-slot 和布局层级。
- **产出**：`src/adapter/dsh-host.ts` 初版、Surface Map。
- **验收**：只登记已验证表面；输入框、编辑器、弹窗和菜单默认 preserve。

### T0-03 · CSS Mount / Dispose POC
- **目标**：验证一个样式包可加载、切换、完整卸载并恢复原生外观。
- **验收**：重复 mount/dispose 100 次，无遗留属性、style、listener。

## M1 · Core Runtime

### T1-01 · Plugin Skeleton
- 建立 Host / Client / Core 结构；实现最小入口与诊断日志。
- 不创建在线市场或复杂设置框架。

### T1-02 · Manifest Schema / Validator
- 实现 `dsh.skin/v1` 校验、SemVer 检查、字段白名单和错误分类。
- 不兼容 / 无效包不得激活。

### T1-03 · Skin Registry
- 扫描内置与本地包目录；构建元数据索引。
- 100 套皮肤时只读 Manifest，不读取所有资源内容。

### T1-04 · Skin Runtime Lifecycle
- 实现 `discover / preload / preview / activate / rollback / dispose`。
- 活动皮肤唯一；切换失败恢复旧皮肤。

### T1-05 · Theme Token Runtime
- 解析 Tokens、合并用户覆盖、调用 DSH Host Adapter。
- 皮肤不直接操作未知宿主变量。

### T1-06 · Static Asset Route / Package Storage
- 在 M0 通过后实现安全资源路由和本地包目录。
- 路径穿越、未知 MIME、超大资源拒绝。

## M2 · P0 Visual Effects

### T2-01 · CSS Renderer + Liquid Glass
- 实现玻璃背景、blur、saturation、tint、edge highlight 和原生回退。
- 只接管 Adapter 允许的 surface。

### T2-02 · Aurora + Light Flow
- 实现两种 CSS 效果；共用参数解析与质量档。
- 动画优先使用 transform / opacity。

### T2-03 · Shared Canvas Scheduler
- 建立唯一 Canvas 2D 层和 RAF 调度器。
- 没有效果时不持续请求下一帧；隐藏页面暂停。

### T2-04 · Floating Dust
- 实现粒子初始化、速度、景深、密度、Resize 与 dispose。
- 不创建逐粒子 DOM。

## M3 · Manager UX

### T3-01 · Skin Gallery / Detail
- 实现皮肤卡片、预览图、标签、兼容状态和详情。
- 管理器必须在皮肤失效时仍能打开。

### T3-02 · Preview / Apply / Reset
- 实现临时预览、持久化应用、超时恢复和失败回滚。

### T3-03 · Preferences Store
- 按 `skinId` 保存用户参数；校验、迁移、重置。
- 不把用户覆盖写回皮肤包本体。

### T3-04 · Import / Export
- 实现 `.dshskin.zip` 安装与导出；staging → validate → atomic rename。
- 导入结构和资源大小必须有上限。

## M4 · P1 / P2 Effects

### T4-01 · Click Ripple
- 复用共享 Canvas；最大并发 4 个 Ripple；不拦截交互。

### T4-02 · Starfield
- 复用 ParticleSystem；支持星点、闪烁、轻微视差。

### T4-03 · Holographic Glass
- CSS 虹彩边缘；Pointer 变量只更新目标 surface。

### T4-04 · Liquid Refraction
- 可选 WebGL Shader；默认关闭；失败回退 CSS。
- 只折射独立背景纹理，不扭曲真实文本 DOM。

## M5 · Hardening

### T5-01 · Coexistence / Native Restore
- 兼容 `data-dsh-skin` 让路标记；检测旧皮肤管理器冲突。
- 验证 Wallpaper Engine、侧栏和弹窗共存。

### T5-02 · Performance Quality Manager
- 实现 Low / Balanced / High / Auto；根据帧耗时降低粒子和效果。

### T5-03 · 10 / 100 Skin Stress Test
- 100 套元数据可发现；只加载活动皮肤；切换 100 次无泄漏。

### T5-04 · Release Readiness
- 文档、示例皮肤、测试报告、兼容矩阵、回滚说明。

## 每个任务的通用 Definition of Done

- 类型检查 / lint / 单元测试通过。
- 新增副作用有对应 dispose。
- 不改变未授权的宿主 DOM / 样式。
- 有正向、负向和回退测试。
- 代码有最小必要注释，不为未来假设堆抽象。
- Review 意见处理完毕后再合并。
