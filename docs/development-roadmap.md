# DSH Skin Engine 开发规划与任务清单

2026-11-10 · v1.5.0 功能基线与后续开发任务

## 后续任务

以 `codex/v1-maintenance` 的 `c94fca6` 为功能基线。v1.5.0 已交付跨明暗 Apply、13 套内置皮肤（含 8 套人物皮肤）、8 项内置效果及本地 ZIP 更新和回滚。官方 DSH `0.2.2-rc.1` 的 Desktop 和 Web 外观专项均通过，同一 tarball 的 Web 证据由 NEXT-01 补齐。v1.1.0 的完整双端矩阵可复用测试方法。 v1.5.0 PR (archived PR #17) · [Web 专项](acceptance.md#v150-web-外观专项-next-01) · [内置目录](../src/host/built-in-skins.ts)

本表综合 `DSH_Skin_Engine_Development_Plan_2026-11-10` 的任务书、路线图和当前实现。NEXT 编号属于开发计划。S 表示小型任务，M 表示中型任务。各阶段版本号为候选，依实际 API 兼容性决定。

| 优先级 | 任务 | 前置 | 交付与验收 |
| --- | --- | --- | --- |
| P0 | NEXT-01 · v1.5.0 Web 补验（S，已完成） | — | 使用既有 tarball 通过双向跨明暗 Apply、Preview/Cancel、保存冲突恢复、重启和 Default。补齐启动阶段、退出状态和脱敏日志记录。 |
| P0 | NEXT-02 · 主线迁移、本地检查和可复建打包（M） | — | 先以维护分支为 PR 目标，用 Node 24 和锁文件执行现有检查，在两份独立检出中核对包清单和 SHA-256。将本地结果登记到对应 PR 的提交。随后单开 PR，将维护分支完整合入 `main`。 [运行与迁移说明](local-verification.md) |
| P0 | NEXT-03 · SceneSpec 声明契约（M） | 01、02 | 冻结可选场景入口、包内图片引用、焦点、锚点、断点及预设。效果参数以 `effects.json` 为准。旧包原样加载，新格式在旧引擎有清楚的拒绝结果。验证越界参数、非法资源和 ZIP 往返。 |
| P0 | NEXT-04 · 响应式插画层（M） | 03 | 复用已解码的包内图片和已审计的宿主表面。覆盖 1280、760、520 像素代表宽度，确认人物焦点、正文、输入和焦点操作可用。缺图回退基色，取消预览、Default、停用时清理自有资源。 |
| P0 | NEXT-05 · 三套场景样例（M） | 04 | 用夜航员、晨光温室、绯雨霓虹及现有特效，交付静态、轻动效、标准动效对照、真实截图和可复建 ZIP。G1 收口用同一 tarball 做双端验收，正文对比度目标 4.5:1。 |
| P1 | NEXT-13 · 素材清单（S） | 02 | 核对 13 套内置和两套独立 ZIP 的来源、授权状态、尺寸、体积和 SHA，标明待审项。建议在 NEXT-05 定稿前完成，便于审核样例发行内容。 |
| P1 | NEXT-06 · 宿主语义 Token 审计（M） | 01、02 | 从画布和侧栏扩展候选审计，建立两端明暗表面矩阵。每个新增映射须有原生令牌、实际样式、对比度和撤销证据。 |
| P1 | NEXT-07 · 单包双明暗（M） | 06 | 同一 `skinId` 可有两套 Token 和插画。定义字段回退，保持旧单组格式。验收系统与手动切换、多窗口、重启和旧异步结果的隔离。 |
| P1 | NEXT-08 · 效果运行时拆分（M） | 05 | 逐步拆分表面定位、场景编排、输入绑定和渲染，保留 8 项效果的 ID、参数与视觉行为。验证共享调度、暂停、幂等释放和 GPU 回退。 |
| P1 | NEXT-09 · 轻量视差与环境光（M） | 05、08 | 选一套人物皮肤验证有限位移与环境光。减少动效和低档时可回退静态，复用现有调度和渲染预算。 |
| P1 | NEXT-10 · 目录缓存和百包规模（M） | 02 | 测量 10/100 包的冷扫描、热读及预览请求，再区分普通读取和强制刷新。用更新、回滚、卸载、取消和跨 profile 用例核对缓存失效。 |
| P2 | NEXT-11 · 版本化 HostAdapter（M） | 02、06，有可验收的新官方 DSH | 逐版本核对 Theme Service、设置槽、认证路由及资源清理。未知版本保守回退，当前宿主继续可用。 |
| P2 | NEXT-12 · 可信效果 Provider（M） | 08、09 | 用示范效果冻结参数、预算、失败回退和挂载生命周期。第三方 ZIP 继续声明式引用获准的效果。 |
| P2 | NEXT-14 · 壁纸与外观插件共存（M） | 04、06 | 先核对所有权和撤销顺序，再决定是否复用局部表面。确认冲突时让路，释放自己的资源时保留对方的样式。 |

### 执行顺序与验收边界

- **NEXT-02 以迁移 PR 合并为收口。** 本地检查先落到维护分支。迁移通过检查与自动审查并合并后，后续开发与打包均以 `main` 为基准，保留 `codex/v1-maintenance`。NEXT-01 的 `appearance` 和 `switch` 套件继续按各自场景复用。 [验收入口](acceptance.md)
- **G0 收口后按 NEXT-03 → 04 → 05 推进。** NEXT-06 可在 01、02 完成后着手审计，NEXT-13 可在 02 完成后整理。SceneSpec 的引擎版本识别、安装更新、导出和作者打包须用同一契约。双明暗配色独立放在 NEXT-07。 [Manifest](../src/core/manifest.ts) · [包文件处理](../src/host/installed-package.ts) · [主题映射](../src/adapter/skin-theme.ts)
- **常规 PR 只验证受影响的路径。** 每次以一个明确范围提交，查看本地检查和自动审查，修复后定向复测再合并。100 次切换、300 秒后台和整套配对性能留在集成或正式发布关口。NEXT-10 的 10/100 包样本只用于验证索引工作量。16.7 ms 是同环境 P95 持续增量排查线。测试记录 Git SHA、tarball SHA、宿主版本、结果和复现命令，结束后关闭本轮启动的 DSH 和浏览器。 [验收方法](acceptance.md)
- 建议从 NEXT-05 验证过的一套场景提炼带注释的作者模板，独立小 PR 交付。新增独立样例沿用 ZIP 工作流，现有内置 skinId 的迁移须先有兼容方案。皮肤编辑器、视频壁纸和在线市场另立专题，第三方包遵守声明式安全边界。 [样例与模板](../DSH_Skin_Engine_Development_Pack_v1.0/examples/README.md) · [本地包更新与回滚](local-package-updates.md)

## v1–v1.1 历史基线

**M0–M5 本地验收完成。** 官方 DSH `0.2.2-rc.1` 的 Web 和 Windows Desktop 已验证 v1 候选包、三套 ZIP 样板、八项效果和 Auto。产物、安装、回滚及兼容矩阵见 [v1 安装与验收](release-v1.md)。 [宿主审计](host-audit.md#m1-实施基线) · [PR-02 验收](#pr-02-校验结果) · [PR-03 验收](#pr-03-目录与资源验收) · [PR-04 验收](#pr-04-静态切换验收) · [PR-05 验收](#pr-05-css-效果验收) · [PR-06 验收](#pr-06-浮尘与性能基线) · [PR-07 验收](#pr-07-管理器与偏好验收) · [PR-08 验收](#pr-08-包管理与安全验收) · [PR-09 验收](#pr-09-p1-效果验收) · [PR-10 验收](#pr-10-折射与自动质量验收) · [PR-11 验收](#pr-11-发布回归)

本仓库在 `470b1f6` 已有产品蓝图、Manifest Schema、三套示例数据及视觉参考。实现沿用一个 DSH 插件管理多套数据包的架构，由引擎提供内置效果。Host 管包目录、校验、资源和持久化，Client 管预览与渲染，DSH Adapter 集中管理宿主差异。在线市场、远程更新、皮肤脚本和 Shader 编辑器排在 v1 之后。 [开发包](../DSH_Skin_Engine_Development_Pack_v1.0/README.md) · [原始任务清单](../DSH_Skin_Engine_Development_Pack_v1.0/docs/10-Codex-Task-Backlog.md)

## v1.0.3 交付复盘

`3d0e032` 构建的 **Skin Engine v1.0.3** 是本节的历史对照基线。官方 DSH `0.2.2-rc.1` 的 Web 和 Windows Desktop 已通过新版面板专项验证。实际 Windows Desktop 配置曾使用内置 CLI 从 v1.0.0 原地升到 v1.0.3，并在重启后核对安装包、启用状态和保存选择。插件版本、皮肤包版本和 Engine API 是三项独立的版本。 [v1.0.3 产物与安装](release-v1.md#v103-设置面板整理) · [产品需求](../DSH_Skin_Engine_Development_Pack_v1.0/docs/01-Product-Requirements.md)

| 原规划目标 | 当前交付和待办 |
| --- | --- |
| M0–M1，FR-01–04。一个引擎管理多套声明式包，支持校验、切换及可逆挂载 | 已交付。宿主边界固定在官方 `0.2.2-rc.1`。文件锁和修订号保护同 profile 写入，已实测两个 Web Host 竞争提交及持锁进程异常退出后恢复。 [宿主审计](host-audit.md#m1-实施基线) · [切换验收](#pr-04-静态切换验收) |
| M2、M4，FR-05。八项效果、共享调度、质量档及降级 | v1.0.0 完成完整验收。v1.0.2 调整 Deep Ocean 输入框底色及浮尘，实测保留 Balanced 的 56 粒子预算。该次输入框截图为新会话，已有会话的输入框和最终包的性能对照纳入下一轮。 [八项效果](release-v1.md#八项效果) · [Deep Ocean 修订](release-v1.md#v102-deep-ocean-外观微调) |
| M3，FR-06–09。预览、应用、恢复、偏好、搜索和 ZIP 管理 | 已交付。v1.0.1 增加就地应用反馈，v1.0.3 采用宽窗画廊与详情并排、窄窗单列，按需展开参数与诊断。旧版曾被误认为已升级，皮肤卡片仍只展示包版本，运行中的引擎版本缺少直观入口。 [面板复验](release-v1.md#v103-设置面板整理) · [管理器蓝图](../DSH_Skin_Engine_Development_Pack_v1.0/docs/07-Manager-UI-UX.md) |
| M5。10/100 包、100 次切换、后台 300 秒、性能、安全和共存 | 完整证据对应 v1.0.0 极光缓存包。与 v1.0.3 解包逐文件比较，仅 `package.json`、`lib/client.js` 和 Deep Ocean 的 `effects.json` 变化，Host 安全及存储证据可沿用同字节基线。v1.0.3 两端专项复验覆盖布局、键盘、偏好和 Deep Ocean ZIP 导入与卸载，长时、压力和性能结果仍按原产物归档。 [发布验收矩阵](release-v1.md#候选包复验进度) · [最终性能复测](release-v1.md#desktop-最终性能复测) |
| 深浅色和作者能力 | 三套随包样板都有深色预览。浅色时已有原生回退与选择保留，首套浅色皮肤待设计和验证。Host 从 CSS 提取白名单值，由引擎映射到已审计的表面。圆角、字体、阴影等字段可通过校验，实际宿主映射仍需独立审计。 [样板](../DSH_Skin_Engine_Development_Pack_v1.0/examples/skins/) · [令牌](../src/core/tokens.ts) · [CSS 白名单](../src/host/skin-css.ts) |
| FR-10、FR-11。本地皮肤包更新与回滚、在线目录 | 引擎 tarball 已有原地换版与回滚流程。ZIP 导入遇到相同 skinId 返回 `duplicate-id`，本地皮肤包更新是待实现的功能。在线目录和远程下载继续排在本地包生命周期之后。 [包管理实现](../src/host/package-management.ts) · [引擎回滚](release-v1.md#回滚) |

## v1.0.4–v1.1 历史任务与验收

**v1.0.4 是下一轮开发的双端验收基线。** PR-15、PR-16、PR-17 和最终候选包验收已合并。Web 与 Windows Desktop 使用同一候选包核对设置页、输入框、停用恢复及发布矩阵。Desktop 补齐配对性能。 [v1.0.3 基线](acceptance.md#v103-基线记录) · [v1.0.4 发布回归](acceptance.md#v104-发布回归记录)

**v1.1.0 已完成发布验收。** PR-20 交付独立打包入口和作者 Starter。PR-19、PR-21 将皮肤库扩至四套内置和两套独立 ZIP。PR-18、PR-22 交付本地更新与单步回滚。两条线用同一份 v1.1.0 tarball 通过双端发布矩阵。 [Starter 与打包说明](../DSH_Skin_Engine_Development_Pack_v1.0/examples/README.md) · [v1.1.0 发布回归](acceptance.md#v110-发布回归)

| 顺序 | 任务 | 依赖 | 可验收结果 |
| --- | --- | --- | --- |
| PR-15 · P0 | 把发布验收变成可复跑流程 | v1.0.3 | 将安装校验、20 次切换、后台 100 秒和性能对照纳入版本控制。用显式传入的 tarball、宿主版本和隔离 profile 运行，保存产物 SHA、结果及复现命令。交付物集中为一份 tarball、三套 ZIP 及 SHA 清单。 [复跑说明与基线记录](acceptance.md) |
| PR-16 · P0 | 在管理器区分安装版本与运行版本 | PR-15 快速回归 | 设置页显示运行中的 Client 引擎版本，诊断显示 Host 版本或不可达，版本不一致时给出重启步骤。皮肤详情区分皮肤版本和 Engine API。已在隔离 Desktop 从 v1.0.0 原地升级到 v1.0.4，重启后核对版本显示、Deep Ocean 和原偏好。 [候选包验证](release-v1.md#v104-运行版本标记) |
| PR-17 · P1 | 收拢设置宽度与输入框的宿主适配 | PR-15 基线 | 设置弹窗和输入卡片定位已纳入版本化 Adapter。官方两端覆盖宽窄窗、新旧会话、减少透明度、模拟外部外观让路和停用恢复，保留编辑、焦点和菜单。 [表面映射](../src/adapter/surface-map.ts) · [双端验收](acceptance.md#v104-宿主表面记录) |
| PR-18 · P1 | 冻结本地更新与回滚契约 · FR-10 | v1.0.4 验收 | 确定同 ID SemVer 比较、原子提交点、活动包切换、偏好保留和单步回滚。建立同一皮肤的两个版本，核对普通导入在活动与非活动场景下都拒绝同 ID 新版。 [本地包契约](local-package-updates.md) |
| PR-19 · P1 | 交付首套浅色样例「纸白」 | PR-17、PR-20 | 源码与真实 Web 缩略图已进入草稿。先用带预览图的同一 ZIP 在两端核对完整生命周期、正文对比度及浅 → 深 → 浅恢复，再登记内置和复验对应 `.sample` ZIP。 纸白草稿 (archived PR #7) |
| PR-20 · P1 | 区分内置皮肤、可导入样例和作者起步模板 | PR-15 基线 | 内置列表继续显式登记，允许将选定的额外样例单独打包为 ZIP。保持现有三个 ZIP 文件名、`.sample` ID 和可重复打包方式。补齐新增样例的契约测试及作者从复制目录到导入的说明。 |
| PR-21 · P1 | 扩充样例库并验收画廊 | PR-19、PR-20 | 交付「静墨」和「暖暮」两个 ZIP。核对名称、标签和来源筛选，验证缩略图、预览、保存、重启恢复和卸载。结合 10/100 包夹具核对目录和预览加载成本。 |
| PR-22 · P1 | 实现本地更新与回滚 · FR-10 | PR-18 | 从独立更新入口对同 ID 的新包做 staging 校验后提交，普通导入继续拒绝重复 ID。验证更新后偏好保留、可回滚，以及读写竞争、取消、磁盘故障或进程中断后旧包可恢复。 |

PR-15 的脚本覆盖真实安装、预览取消、应用保存、设置页恢复和渲染基线。PR-16 补测真实 Desktop 原地升级。日常改动按影响面选最少用例，复用仍适用的证据，失败后针对性补测。多个阶段合入后的大版本等集成里程碑，再用同一候选包集中跑两端的 10/100 包、ZIP 往返、100 次切换、真实隐藏 300 秒与恢复，以及 Default、静态和 P0 的配对性能。沿用 PR-06 的 16.7 ms 持续回归排查线。Host、安全边界或数据契约有变更时，选对应认证、取消、回滚和恶意包负例。 [基线与门槛](#pr-06-浮尘与性能基线) · [原始验收](../DSH_Skin_Engine_Development_Pack_v1.0/docs/11-Testing-and-Acceptance.md)

新增 DSH 支持版本单独立项，先指定官方产物，再验证 Loader、设置槽、令牌、认证路由和适配回退。Wallpaper Engine 继续沿用实测通过的被动让路策略，重新考虑主动标记前先复验真实轮播。FR-11 保持在本地包更新之后。 [宿主支持边界](host-audit.md#m1-实施基线) · [共存证据](host-audit.md#t5-01a-参考插件共存)

### 皮肤样例与作者模板

现有三套样例均为深色。Deep Ocean 覆盖 P0 组合，Aurora 覆盖冷色环境光，Obsidian Neon 覆盖虹彩、星空和交互涟漪。v1.1 首批目标是 **4 套内置皮肤、2 套独立 ZIP 样例**，共 6 种外观，另有作者 Starter。内置皮肤对应的 `.sample` ZIP 用于演示导入，和原皮肤算同一种外观。 [现有样例](../DSH_Skin_Engine_Development_Pack_v1.0/examples/skins/) · [内置目录](../src/host/built-in-skins.ts) · [打包入口](../scripts/pack-samples.mjs)

| 样例 | 使用场景和实现 | 交付与专项验收 |
| --- | --- | --- |
| 纸白 · Paper Light | 暖白底色的浅色阅读和写作样例。以画布、侧栏令牌为主，效果列表为空。 | 内置候选和 ZIP。核对正文、链接、代码块、占位文案与焦点。切到深色时保留保存选择并恢复原生，回到浅色时恢复同一皮肤。 |
| 静墨 · Ink Focus | 石墨底色的静态深色样例，面向长时间阅读与编程。保留宿主的输入、菜单和弹窗样式。 | ZIP。核对文本、代码和焦点对比。应用后无引擎 Canvas、WebGL 或持续动画。验证 Reduced Motion 与强制颜色下的可操作性。 |
| 暖暮 · Warm Dusk | 暖棕与暗琥珀的深色低动效样例，初版仅用 CSS 玻璃和低强度边缘流光。 | ZIP。核对窄窗、侧栏折展和输入对比。Static、Reduced Motion 或隐藏时停动，降低透明度时保留可读底色。 |
| 作者起步模板 · Starter | 提供最小 `skin.json`、`tokens.json`、`effects.json`、受限 `theme.css` 和复制说明。以静态配色演示 ID、版本、色彩模式、预览路径和能力声明。 | 随开发包交付源码。复制后改用自己的 ID 和预览，走同一校验与 ZIP 导入流程。作者模板与面向用户的画廊样例分开登记。 |

#### 首批之后的模板任务

作者从 `examples/templates/` 复制源码，用户从 `examples/skins/` 对应的 ZIP 导入皮肤。继续复用 `pack:skin` 和生产校验器。样例扩大视觉选择，模板各演示一条可复刻的实现路径。 [源码与打包入口](../DSH_Skin_Engine_Development_Pack_v1.0/examples/README.md)

| 优先级 | 候选任务与依赖 | 可验收结果 |
| --- | --- | --- |
| P2 | **CSS 氛围模板**。暖暮通过双端验收后，从已验证的效果中提取一项 `light.flow`。 | 提供带注释的复制说明和可打包源码，演示低强度边缘流光、CSS 能力声明和静态底色。两端核对窄窗、键盘操作、Reduced Motion 和 Static，确认无 Canvas。 |
| P2 | **轻粒子模板**。沿用 Deep Ocean 已有共享调度器，单独演示 `particles.dust` 与 `low` 质量档。 | 提供可打包源码，记录粒子数、Canvas 数和动态关闭时的停帧。两端核对后台恢复、Reduced Motion 和恢复 Default 后的清理。 |

v1.2 采用两套静态内置样例扩大画廊。雾松是第二套浅色样例，使用灰绿画布和侧栏。夜航员展示原创人物插画、静态背景和内置素材的声明方式。两套样例均可从同一份源码打包为独立的 `.sample` ZIP。 [v1.2 内置画廊](release-v1.md#v12-内置画廊扩充)

两个作者模板单独登记，给出可复用的 ID 规则、效果参数、能力声明、打包命令和导入步骤。复跑复制 → 改 ID（含 CSS 作用域）→ 打包 → 导入 → 预览 → 应用 → 卸载。以实际 ZIP 和校验结果作为交付证据。新增模板可分别提交，v1.1 首批以已有 Starter 为作者侧交付门槛。

明暗双适配另立任务。当前 `both` 在两种外观模式下使用同一组颜色，明暗预览可以分别指定。需要两套令牌时，先设计向后兼容的数据契约。折射实验样例另立任务，默认走 CSS，用户明确开启后才启用 WebGL，并实测上下文丢失、降级和释放。在线目录与远程下载排在本地更新和回滚通过之后。 [色彩模式与令牌映射](../src/adapter/skin-theme.ts) · [折射发布记录](release-v1.md#八项效果)

#### 样例交付标准

1. 每套用户样例使用稳定 ID、SemVer、明确的颜色模式及最少所需能力。用实际支持的语义令牌和内置效果制作，沿用 ZIP 文件、资源和 CSS 校验。作者起步模板须能按文档复刻并完成导入。 [包契约](../DSH_Skin_Engine_Development_Pack_v1.0/docs/03-Skin-Package-Spec.md)
2. 预览来自官方 DSH 的隔离空白会话，覆盖所声明的模式，素材记录来源和许可。新增样例登记 ZIP 与预览体积。内置候选另记录 tarball 增量。打包后核对清单、包内预览路径和 SHA-256。 [素材记录](release-asset-notes.md)
3. Web 和 Windows Desktop 均用同一候选包完成导入、预览取消、应用、重启恢复、卸载和 Default 清理。代表性样例在新旧会话、宽窄窗和键盘操作下核对正文、输入框、焦点和菜单。正常正文采用至少 4.5:1 的项目对比度目标，记录实际取样表面及运行模式。
4. 记录宿主版本、候选包 SHA、截图与结果。测试成功、失败或取消后，都关闭本轮启动的 DSH Desktop、Web Host 和浏览器夹具，并按隔离目录和进程记录确认退出。 [复跑流程](acceptance.md)

## 仓库研究与适配基线

| 来源 | 已核对的实现 | 对本项目的影响 |
| --- | --- | --- |
| `dsh-deep-whale` · `d9bb498` | 管理器从当前 profile 依赖发现带 `skin.json` 的独立插件。浏览器通过 `settings.section` 注入管理器，通过各皮肤的 `bodyAttr` 识别生效状态。切换路径改写配置，并按宿主场景等待收敛或刷新。 | 借鉴目录校验、状态互斥、按皮肤归一化用户偏好和清理测试。数据包切换由引擎自身完成，旧皮肤的 bundle patch、跨插件配置事件和刷新路径只用于理解兼容边界。 [管理器 Host](https://github.com/Small-tailqwq/dsh-deep-whale/blob/d9bb4989c941d4d1d5cee1fa8388f2d14f0a771b/skin-manager/src/index.ts) · [设置入口](https://github.com/Small-tailqwq/dsh-deep-whale/blob/d9bb4989c941d4d1d5cee1fa8388f2d14f0a771b/skin-manager/src/client/index.ts) · [切换实现](https://github.com/Small-tailqwq/dsh-deep-whale/blob/d9bb4989c941d4d1d5cee1fa8388f2d14f0a771b/skin-manager/src/client/SkinManager.tsx#L1055) |
| `dsh-deep-whale` · 资源与生命周期 | 公开美术走清单白名单、内容哈希、正确 MIME 和可撤销路由。管理器的 API 另有 `connection.requestRejection` 和同源检查。已有测试覆盖半途初始化失败及重叠激活后的清理。 | 复用验证方法。把随包公开素材与用户导入素材分开确定访问和缓存策略。逐文件核对代码许可与署名链，示例皮肤使用自行制作或另有授权的素材。 [素材交付](https://github.com/Small-tailqwq/dsh-deep-whale/blob/d9bb4989c941d4d1d5cee1fa8388f2d14f0a771b/docs/asset-delivery.md) · [应用测试](https://github.com/Small-tailqwq/dsh-deep-whale/blob/d9bb4989c941d4d1d5cee1fa8388f2d14f0a771b/maid-atelier/tests/apply.spec.ts#L235) · [授权说明](https://github.com/Small-tailqwq/dsh-deep-whale/blob/d9bb4989c941d4d1d5cee1fa8388f2d14f0a771b/README.md#L291) |
| `dsh-wallpaper-engine` · `e8d832f` | Glass 先判断表面所有权，独立装饰层负责滤镜与光影。客户端只读 `html[data-dsh-skin]`，按当前条件暂时退出壁纸、轮播和玻璃，持续退场后复位。该标记在源码中指向独立的 `dsh-skins` 皮肤中心。 | 借鉴少量已登记 surface、保留原生及按所有权撤销。将共存定义为可预测地让路和恢复。混搭显示和首帧优先级需独立实测。Deep Whale 用 `data-dsh-maid-atelier` 和 `data-dsh-orca-link`，须单独覆盖冲突。 [表面 ADR](https://github.com/elysia395/dsh-wallpaper-engine/blob/e8d832fc6605af80e2454ccd6dcdfdc4f380822f/docs/adr/0015-glass-surface-ownership.md) · [让路实现](https://github.com/elysia395/dsh-wallpaper-engine/blob/e8d832fc6605af80e2454ccd6dcdfdc4f380822f/src/client.js#L486) |
| 官方 DSH · `0.2.2-rc.1` | 本地 `<local-path>/deepseek-harness` 的发布 tag 对应 `66491b05e3`。该 tag 提供 `settings.section`、可按来源释放的 `theme.overrideTokens` 及 owner 专属的精确 Fetch 路由。槽出口使用 `display: contents`，装饰层需定位到生成布局盒子的元素。 | M1 以该 RC 的官方 Web 和 Windows Desktop 为适配基线。新增宿主版本、令牌或表面按真实运行结果登记。 [官方发布](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1) · [主题服务](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-theme/src/client/index.ts#L376) · [槽渲染](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-renderer/src/client/scoped-slots.tsx#L1067) |

已验证三份示例 Manifest 的 JSON Schema、入口和预览文件存在性，以及 `node-semver` 的版本匹配结果。Wallpaper Engine 的 `verify-host-teardown.mjs` 通过了已执行的源码顺序和负对照断言，后续导入因本地缺少 `dsh-plugin-wallpaper-engine-about-notice` 中断。下文的 DSH 契约以本地发布 tag 的官方文档为准，涉及载体和方法时对照同 tag 的源码。真实 DSH 上的行为由 M0 样机验证。

## DSH 插件接入

| 环节 | 官方契约与引擎接入方案 |
| --- | --- |
| 安装和组合 | 引擎以一个 npm 组合包发布，`package.json` 通过 `dsh.bundle.patch` 声明配置层。patch 插入一个稳定 ID 的条目，`name` 使用裸包名。生效配置依次叠加 bundle、profile patch、home patch 和命令行 overlay，后层按 ID 覆盖，`config` 整体替换。DSH 管理 `.tgz` 组合包的安装、启停与移除。引擎管理 `.dshskin.zip` 的导入与切换。交付预构建 tarball，在干净 profile 验证安装无需批准依赖构建脚本。 [打包与安装](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/user/develop/basic/publish.zh.md) · [Profile 管理](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/boot.zh.md) |
| 更新与回退 | 组合包的依赖安装、配置层启用和运行时激活分别检查。读取 DSH 的 `application` 状态，区分 `applied`、`restart-required`、`overridden` 和 `failed`。启用 HMR 时，已能识别为同名的安装目标会返回 `already-installed`。以保存业务数据、卸载旧版、安装并启用目标 tarball 为手动换版流程。M5 验证旧版回装及业务数据恢复，尤其是新版本已写入新存储格式的情况。 [插件管理器](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/boot/plugin-manager/README.zh.md#understand-the-implementation) · [领域版本](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/storage.zh.md#领域版本) |
| Host 和 Client 构建 | 同一个包导出 Host 入口 `.` 与 Client 入口 `./client`，声明 `dsh.client.platform: web`。Client 模块系统扫描已启用的裸包名条目，按包名注册 lazy-CJS factory，子路径条目不挂浏览器半侧。仓库外需复刻 `clientBundle` 的产物格式，React 等共享模块从宿主模块表获取。区分 `dsh.client.inject` 的包级依赖边和插件导出 `inject` 的 Cordis 服务名。 [客户端模块](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/client-modules.zh.md) · [浏览器半侧构建](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/cookbook/adding-a-settings-card.zh.md) |
| 生命周期与 UI | 硬依赖缺席时 fiber 等待，提供方消失时消费方卸载并在服务恢复后重新激活。启动时的 Client 审计会报告未激活条目，M0 需要验证依赖缺席时的诊断和降级。管理器以 `ctx.slots.inject('settings.section', …)` 跟随设置槽声明，通过 props 传数据和操作。外部 DOM/CSS、观察器和动画句柄归其 Cordis effect。需要按顺序释放的异步步骤放在同一个 disposer 中依次执行。 [服务注入](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/cordis-tutorial/03-services.zh.md) · [生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/cordis-tutorial/02-lifecycle-and-effects.zh.md) · [Slots](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/slots.zh.md) |
| 配置与业务状态 | DSH 的 volatile Config 表单按 Loader 条目编辑部署选项，经 ConfigEditor 写 profile patch。活动皮肤和按 skinId 保存的偏好由引擎 Host 管理。M0 已验证按 profile 命名的 `storageDomain` 在重启后可恢复，且不同 profile 互相隔离。Client 持有渲染状态及窗口级预览。状态格式版本由引擎管理，读取旧格式、写入新格式和回装旧版均纳入验收。 [设置表单](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/settings.zh.md) · [领域存储](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/storage.zh.md) · [Loader 持久化迁移](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/upgrade-guide/v0.2.2-alpha.2/cordis-loader-entry-trees/guide.zh.md) |
| 请求载体 | 官方 Desktop 从 `dsh-app://app/` 启动，由 Electron 向已认证的 Web Host 转发请求。HTTP 子系统页对此仍写作 `file://` 与 IPC，桌面接入以同 tag 的 Desktop README 和转发实现为准。Web 与 Desktop 均使用按部署路径解析的请求地址，验证实际协议、身份和取消行为。 [HTTP 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/web-server.zh.md) · [Desktop 架构](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/apps/desktop/README.zh.md#L38) · [请求转发源码](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/apps/desktop/src/web-document.ts#L77) |

## M0 与 M1 要冻结的契约

| 议题 | 当前差异与建议决策 | 决策门 |
| --- | --- | --- |
| 版本和字段 | DSH 优先按 `engines.dsh` 检查组合包，字段缺席时才检查 DSH peer 范围。用户可针对精确的插件版本和 DSH 版本授予安装与启动豁免。引擎独立验证皮肤的 `engineApi`、`dshCompatibility` 和 Adapter 支持范围。数据包的 DSH 范围采用 `includePrerelease: true`，所以示例的 `>=0.2.0` 可以匹配 `0.2.2-rc.1`。实际宿主版本还须命中 Adapter 已验证范围，读不到版本或版本不受支持时保留 Default。优先探测宿主导出的 `getDshRuntimeVersion()` 在预构建组合包中的可用性。 [DSH 版本检查](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/boot/app-boot/README.zh.md#profiles) · [版本豁免](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/boot/plugin-manager/README.zh.md#version-compatibility-and-exemptions) | PR-02 用正式版、RC、alpha、未知宿主及宿主豁免场景验证独立判定。 |
| Schema 和兼容诊断 | Manifest Schema 已设置 `additionalProperties: false`，而安全章将未知字段定为警告。建议 v1 按 Schema 拒绝未知字段和 capability。Tokens 与 Effects 用各自 JSON 的 `schema` 版本，取消共存章中额外的 `tokenSchema` 和 `effectsSchema` 提案。已知效果参数与声明能力不符时拒绝加载。未知效果 ID 只产生诊断并跳过。用 SemVer 解析器补足现有正则接受 `1.0.0-01` 和 `1.0.0-alpha..1` 的缺口。 [Manifest Schema](../DSH_Skin_Engine_Development_Pack_v1.0/schemas/skin-manifest.schema.json) · [安全规范](../DSH_Skin_Engine_Development_Pack_v1.0/docs/08-Performance-Security.md) · [SemVer 2.0.0](https://semver.org/) | M1 用三套有效示例和负向夹具锁定行为。 |
| 示例皮肤 | PR-02 校验并打包三套初稿，早期预览缺席时使用占位。M1 用 Deep Ocean 和 Aurora 验证可切换主题，M4 用 Obsidian Neon 验证 P1 组合。M5 三套样板均已随包提供真实深色预览，清单与当前交付一致。 [示例皮肤](../DSH_Skin_Engine_Development_Pack_v1.0/examples/skins/) | 扩大色彩模式声明前先完成相应真实宿主实测。 |
| 设置与渲染表面 | 引擎通过已验证的 `settings.section` 注册设置页，设置入口独立于活动皮肤。M0 已确认应用背景和一个可见侧栏的令牌载体。每个 surface 记录源码、定位方式、是否有盒子、状态变化和原生回退。顶栏、右栏按证据开放，编辑器、菜单和弹窗保持原生交互与层叠。 [宿主适配蓝图](../DSH_Skin_Engine_Development_Pack_v1.0/docs/06-Host-Adapter-and-Coexistence.md) · [DSH 设置槽](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-settings/src/client/contract/slots.ts#L57) | 后续开放装饰层前复验浅深色、窄窗、侧栏收起、浮层焦点与卸载。 |
| 壁纸和旧皮肤 | 区分引擎内部作用域 `data-dsh-skin-id` 与外部让路标记 `data-dsh-skin`。M0 实测 Wallpaper Engine 1.4.2 在让路结束后恢复了壁纸和轮播开关，定时切换未继续。首轮遇到活动壁纸或旧皮肤时保留当前所有者。引擎预览中遇到冲突时只释放自己的令牌。仅玻璃的让路已有正向证据，外部标记由 Adapter 按验证过的条件发布并按所有权撤回。 [实测与回退](host-audit.md#t5-01a-参考插件共存) | M1 做所有权和回退测试，M5 用真实插件重验。启用活动轮播让路前须实测恢复后的自动切换。 |
| 随包资源 | 公开图片沿用 M0 验证的 `./assets/*` 导出、内容摘要文件名及 `require.asset`。DSH 只提供活动客户端包导出的白名单图片。Web Host 返回公开 immutable 缓存头，Desktop 转发将 `/plugins/` 响应设为 `no-store`。CSS、字体和用户导入素材按引擎的类型与访问规则提供，私有资源使用 owner 路由和 `Cache-Control: no-store`。 [包资源](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/modules/README.zh.md#package-assets) · [Desktop 转发](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/apps/desktop/src/web-document.ts#L64) | PR-03 分别验证两端缓存头、缺图占位、访问权限、取消、路径和 MIME。 |
| 私有 API 和本地导入 | 沿用 M0 的 `ctx.connection.fetch.register` 精确 `/api/…` 路由。载体完成认证与来源检查，Connection 仅向 owner Peer 派发，注册由所属 fiber 释放。Host 还须按当前 profile 校验包和资源归属。该 RC 支持 `GET`、`HEAD`、`POST`，保存和删除使用命名 POST。`requestBody: 'streaming'` 由引擎逐块计数并处理取消。Desktop 校验应用 Origin 后转发，Host 收到的是认证转发请求。M0 的 Desktop 客户端已证实取消，Host 端收到取消仍需复验。 [Connection API](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/connection/src/rpc.ts#L146) · [owner 派发](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/connection/src/rpc-host.ts#L208) · [Desktop 转发](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/apps/desktop/src/web-document.ts#L77) · [取消证据](host-audit.md#t0-03-样机验证) | 先交付内置皮肤和受控本地目录。PR-08 用两端真实入口验证中途取消、Host 停止处理和 staging 回收后开放 ZIP。 |

### 切换事务与资源所有权

- 区分持久化选择、当前渲染和窗口内临时预览。准备阶段解析目标包和必要资源，旧皮肤继续可见。提交阶段检查操作仍有效，再交接样式、令牌、效果和标记。预览超时或取消时恢复当前持久化选择。应用以成功持久化作为提交条件，刷新后读取同一份权威状态。
- 同一窗口串行提交，过期的预加载、超时回调和 dispose 按操作代次失效。同一 Host 内，在同一串行区间校验预期修订号并持久化。`storageDomain` 的写入队列和 `domain/changed` 仅限进程内，JSON 后端也没有跨进程写锁。PR-04 在开放业务写入前验证同一 profile 的单写者约束，或实现跨进程协调并验证异常退出后的恢复。 [领域存储](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/storage.zh.md#打开的领域) · [JSON 后端](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/storage/storage-json/README.zh.md)
- 挂载或确定未提交的写入失败时清理目标并恢复旧皮肤，恢复失败时进入 Default。客户端失去保存响应时重新读取 Host 状态。若后端报告落盘结果不确定，Host 停止使用旧内存快照，关闭并重开受影响的存储单元及领域后再读盘确认。效果不支持所触发的预设降级单独报告。 [领域版本与失败恢复](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/storage.zh.md#领域版本)
- 每个副作用绑定到一次激活。第一处可失败操作前登记清理，并在每次取得资源后记录句柄。恢复令牌、属性及内联样式前核对所有权和当前值。活动包卸载先提交 Default 再移除包，删除失败时保留可重试的包记录。管理器在回退期间仍可打开。

### 外部皮肤包安全边界

- Host 只从引擎管理的目录读包。ZIP 先按规范化路径与配额检查，再在同卷 staging 中流式解压、验证和原子发布。采用蓝图初值 64 KB Manifest、5 MB 单文件、20 MB 解压总量，并为条目数、路径深度和压缩比设上限。拒绝路径穿越、绝对路径、Windows 设备名和数据流、大小写碰撞、链接和重复 ID。安装中断后清理 staging，原有版本继续可用。
- 用 CSS 解析器验证选择器、属性、函数和每个资源引用，采用白名单。首发只开放受限的皮肤变量和引擎自有装饰表面。相对 URL 解析后须仍指向同包白名单资源，CSS 转义和编码路径也执行同一规则。样式拒绝 `@import`、外部 URL、data URL、危险定位和遮挡规则，未知语法拒绝。禁用动态效果时连同皮肤 CSS 的自定义动画一起停用，首发可将动画交给内置效果。
- 资源路由按已验证的包 ID 与资源清单查找，确认真实路径、文件类型、大小和读取权限。ZIP 安装、删除和偏好写入校验准入与来源。导出分离包本体和可选配置，默认排除私有素材。

## 里程碑和 PR 顺序

| 里程碑 | 范围 | 退出条件 |
| --- | --- | --- |
| M0 · PR-01 | 固定宿主版本，验证最小组合包和共存 | 同一 tarball 在 Desktop 和 Web 装载 Host/Client，设置槽、CSS/令牌、路由按生命周期释放。明确 profile 存储归属、认证与 ZIP 路线及首批安全表面。 |
| M1 · PR-02 至 PR-04 | 包契约、Registry、静态主题与切换事务 | Default、Deep Ocean、Aurora 可在同一窗口切换，预览取消、持久化失败和重复卸载可恢复。 |
| M2 · PR-05 至 PR-06 | Liquid Glass、Aurora、Light Flow、Floating Dust | Deep Ocean 样板四效果同开，支持静态、动态、节能和关闭四种状态。保护宿主操作并完成首轮性能测量。 |
| M3 · PR-07 至 PR-08 | 管理器、配置、导入导出与卸载 | 普通用户可在 UI 完成预览、应用、恢复、配置、安装与卸载。上传待验证时可先交付内置皮肤体验版。 |
| M4 · PR-09 至 PR-10 | Click Ripple、Starfield、Holographic Glass、Liquid Refraction | 三项 P1 可独立开关。P2 默认关闭，主动启用才创建 WebGL 上下文，创建失败或丢失时切回 CSS。 |
| M5 · PR-11 | 真宿主回归、压力测试和发版 | 三套示例可安装，八项效果均有开关和降级路径，安全用例和兼容矩阵达标，提供安装及回滚说明。 |

M3 形成用户可操作的 P0 体验版。完整 v1 在 M5 发布。如果实测决定延期 Liquid Refraction，需明确调整 v1 范围和验收口径。原蓝图的阶段估算相加为 **18–25 个工程日**，以一名熟悉 DSH 的工程师为前提。M0 结束后根据宿主差异、导入安全与测试成本重新估算。 [原始里程碑](../DSH_Skin_Engine_Development_Pack_v1.0/docs/09-Milestones-and-PR-Plan.md) · [原始发布门槛](../DSH_Skin_Engine_Development_Pack_v1.0/docs/11-Testing-and-Acceptance.md)

## 可执行任务

保留蓝图 T 编号。PR-01 样机结果以宿主审计为准。表中的前置只列直接依赖，功能可用以对应验收结果为准。 [宿主审计](host-audit.md)

| PR | 任务 | 前置 | 交付及验收 |
| --- | --- | --- | --- |
| 01 | T0-01 · 确认宿主入口与权限 | 无 | 在独立 `DSH_HOME` 固定官方版本与 Web、Desktop 测试 profile。核对 bundle 层、裸包名条目、两侧注入与启动诊断，列出 profile 存储、包图片、认证路由与上传候选。用 `docs/host-audit.md` 记录证据并列出样机待验证项。 |
| 01 | T0-02 · 记录令牌和安全表面 | T0-01 | 以真实计算样式确认最少一组配对的浅深色 token、一处背景和一处侧栏。记录候选锚点与 `preserve` 场景，样机通过后交付 `src/adapter/surface-map.ts`。 |
| 01 | T0-03 · 证明挂载可撤销 | T0-01、T0-02 | 在 Web 和 Desktop 用预构建 tarball 经真实 Loader 安装。实现最小设置入口、可释放的令牌层、公开包图片和认证只读路由，补测存储恢复和上传取消。验证设置槽、依赖服务和引擎的卸载与重新激活，记录即时生效与需重启的情况。反复挂载/释放 100 次，注入部分失败，核对路由、属性、样式和监听器回到基线。 |
| 01 | T5-01a · 验证跨插件让路 | T0-03 | 固定参考插件版本，验证壁纸存在/不存在、轮播、启动/重启、手动切换、快速取消及恢复。验证旧皮肤标记与冲突时的原生回退。用失败场景决定最小共存策略。 |
| 02 | T1-01、T1-02 · 插件骨架和数据校验 | PR-01 | 在样机的 TypeScript、esbuild 和 Node 测试基础上添加 Core 校验。核验 `dsh.bundle.patch`、Host 入口和 lazy-CJS Client，用实际 Loader 验证预构建包和宿主版本读取。覆盖三套示例、RC、宿主豁免、非法 SemVer、非法路径、未知 capability、参数越界及 renderer 不符。 |
| 03 | T1-03、T1-06 · 目录索引与资源读取 | PR-02 | Registry 只读取包元数据，目录扫描容忍单包损坏，拒绝重复 ID。资源按需读取，覆盖公开包图片和认证的用户资源，测试缺失占位、错误 MIME、越界路径、跨 profile 读取拒绝、请求取消和路由回收。先走内置和受控目录。 |
| 04 | T1-04、T1-05、T5-01b · 切换、令牌与恢复 | PR-03 | 用两套示例验证预加载、预览、应用、失败回滚和 Default。覆盖快速 A → B → A、刷新、同 profile 并发写入、落盘结果不确定后的重读及加载中卸载。令牌与属性释放保留外部改写。Adapter 接上 M0 确认的让路策略。 |
| 05 | T2-01、T2-02 · CSS 效果 | PR-04 | 玻璃只画已确认表面。Aurora 与 Light Flow 使用有限装饰层，动态总开关和隐藏页能停止 CSS 动画。无滤镜、无安全载体或低性能时保留可读底色。 |
| 06 | T2-03、T2-04、T5-02a · 共享调度与尘埃 | PR-05 | 每个窗口最多一个共享 Canvas 2D 和一个引擎 RAF。实现可见性、DPR、Reduced Motion、低/平衡/高档与空闲停帧。Dust 无逐粒子 DOM。Deep Ocean 同时覆盖四项 P0。 |
| 07 | T3-01、T3-02、T3-03 · 管理器与偏好 | PR-04、PR-06 | 设置页卡片、搜索和标签、兼容诊断、预览/确认/恢复、参数调整与 Reset。偏好按 profile 和 skinId 保存和迁移。引擎回退时管理器仍可访问，预览过期和刷新恢复持久化状态。 |
| 08 | T3-04 · 安全导入导出与卸载 | PR-07、M0 的访问决策 | 经 owner 路由接收 ZIP，限制压缩字节和解压配额，校验受限 CSS 后原子发布。用两端真实入口覆盖伪造来源、非 owner 及中途取消，观察 Host 停止处理并回收 staging。覆盖重复 ID、文件损坏与写入失败。活动包卸载后可从 Default 继续操作，导出包和可选配置可往返验证。 |
| 09 | T4-01、T4-02、T4-03 · P1 效果 | PR-06、PR-07 | Ripple 上限 4 且不截获点击。Starfield 共用 Canvas 与调度器。虹彩指针值只更新本地表面。Obsidian Neon 验证组合，低档和 Reduced Motion 保留静态表现。 |
| 10 | T4-04、T5-02b · 可选折射与自动质量 | PR-09、P0 性能基线 | 折射仅使用独立背景纹理。WebGL 复用引擎调度，处理上下文丢失及失败回退。基于实测为 Auto 设定降档和恢复滞回，验证静态皮肤仍可用。 |
| 11 | T5-01c、T5-03、T5-04 · 发布回归 | PR-08、PR-10 | 在真实 DSH 中复验两类参考插件、预构建包安装和激活、卸载换版及回装恢复、10/100 包元数据、100 次切换与五分钟后台暂停。提交版本支持矩阵、性能数据、授权清单、安装和回滚步骤。 |

PR 验收至少包含构建、类型检查、lint、相关正反例及回退用例。涉及宿主 UI 的变更同时附真实 DSH 版本、操作步骤和截图或日志。Review 与 CI 通过后合并，再从已合并的基线开始下一条依赖任务。

## 发布验收矩阵

| 维度 | 必测路径与通过条件 |
| --- | --- |
| 宿主与共存 | 同版本同 profile 先取官方 Default 基线，再测 Windows Desktop 与 Web 的浅/深色、窄/宽窗口、会话/工作区、侧栏、编辑器、菜单、弹窗和键盘焦点。检查壁纸让路前后的选择、轮播、玻璃与主题。其他平台按实测填写矩阵。 |
| 状态与泄漏 | 覆盖预览取消、超时、刷新，快速切换、加载失败、写入失败、活动包卸载、插件禁用与重启。100 次切换后，引擎持有的节点、标记、路由、监听器和 Canvas 数量回到预期。Default 和静态主题无常驻引擎 RAF。 |
| 性能与降级 | 在每端用同一设备、宿主版本、分辨率和会话夹具比较 Default、纯静态及 P0 四效果。沿用 PR-06 的质量预算与回归门槛，并在真实窗口后台五分钟后检查停帧与恢复。 [PR-06 基线](#pr-06-浮尘与性能基线) · [初始预算](../DSH_Skin_Engine_Development_Pack_v1.0/docs/08-Performance-Security.md) · [参考测量方法](https://github.com/Small-tailqwq/dsh-deep-whale/blob/d9bb4989c941d4d1d5cee1fa8388f2d14f0a771b/docs/performance-issue-114.md) |
| 包安全与规模 | 10/100 套只扫描 Manifest，按需取可见预览及活动资源。拒绝穿越、压缩炸弹、未知能力、CSS 逃逸及未授权请求。安装失败保持已安装目录、活动皮肤和用户配置的一致性。 |
| 视觉与可访问性 | 逐项对照效果参考图。玻璃和背景在浅深色下保证正文、代码块及焦点可辨。低档、Reduced Motion、不支持滤镜和 WebGL 丢失时仍可正常操作。发布门槛为安全负向用例全部通过，兼容矩阵内无已知阻断或高优先级问题。 [视觉参考索引](../DSH_Skin_Engine_Development_Pack_v1.0/docs/13-Visual-Reference-Index.md) |

## PR-01 验收清单

1. 用官方 `0.2.2-rc.1` 准备隔离的 Windows Desktop 和 Web 环境。Web 以随附 `web` 模板创建独立 profile，用 `--dump-config` 核对合成条目。Desktop 用隔离 home 中的保留 `desktop` profile，从桌面插件管理入口核对装载和启停。记录精确版本和复现步骤。 [CLI 参考](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/apps/cli/reference/README.zh.md) · [Desktop profile](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/architecture.zh.md#桌面应用)
2. 构建并打包最小双入口组合包。用一个裸包名条目挂载 Host 和 lazy-CJS Client。设置槽显示诊断块并提供挂载/释放令牌的动作。分别探测公开包图片和 `ctx.connection.fetch.register` 的 owner 只读请求。
3. 验证令牌恢复、路由重注册、100 次挂载清理、失败路径、壁纸让路和旧皮肤冲突。分别验证 Web 与 Desktop 的请求地址、跨站与非 owner 拒绝、流式 POST 取消以及 profile 存储重启恢复。按实测为每项能力写明已证实、受限或待验证。
4. 在 `docs/host-audit.md` 记录结论，冻结首版宿主范围、安装与入口约定、首批表面、存储与请求权限、导入和共存策略，以及 M1 的实施前置。

## PR-02 校验结果

- T1-01、T1-02 的构建和运行时共用 [Core 校验器](../src/core/skin-package.ts)。Manifest 的语义版本使用 `node-semver`，数据 API 为 `1.0.0`。Adapter 使用宿主安装提供的 `getDshRuntimeVersion()`。`engines.dsh` 和当前 Adapter 均固定于已验证的 `0.2.2-rc.1`。未知或未验证版本的拒绝使用隔离夹具验证，官方宿主实测覆盖受支持版本。
- 令牌缺省时使用原生值。颜色限十六进制，字体限通用字体族，阴影限一个带范围约束的 `rgba` 阴影或 `none`。声明路径限定在 `preview/` 和 `assets/`，按 Windows 大小写规则查重。PR-03 还需校验实际文件路径和 MIME，PR-08 还需校验外部 CSS 与 ZIP。
- [八项参数契约](../src/core/effects.ts)为已知效果填充有界默认值，并校验 renderer 和能力。Click Ripple 和 Liquid Refraction 的 ID 分别固定为 `interaction.ripple` 和 `glass.refraction`。未知 ID 给出 `unknown-effect` 诊断后跳过。此阶段验收数据解析，渲染依照 PR-05 至 PR-10 的任务推进。
- `npm run typecheck`、`npm run lint`、`npm test` 通过。10 项测试包含 [数据契约](../test/skin-contracts.test.mjs)和 [宿主样机](../test/audit.test.mjs)。`npm pack --pack-destination .cache/pr-02` 生成 `dsh-plugin-skin-engine-0.0.1-contracts.0.tgz`。SHA-256 为 `b7e308a539f3969e896c52ba211fbb66714d03857676985a73e3892db0d8a6a1`。包内含 Host、Client、bundle patch、公开图片和三套数据，安装未增加运行时依赖或构建审批。
- 官方 Web 使用 `skin-engine-contracts` profile，Windows Desktop 使用隔离 home 的 `desktop` profile。按 [PR-01 的安装步骤](host-audit.md#复现路径)装入同一 tarball。打开「设置 → Skin Engine audit」，两端均只有一个入口，样机图宽 28 px。经各端认证页面读取 `api/dsh-skin-engine/audit/contracts` 均为 200，返回实际宿主 `0.2.2-rc.1`、三套样例、效果计数 `4 / 3 / 3` 和空诊断。Web 未认证为 401。Desktop 换版后仍读到上版的探测值。隔离证据位于 `.cache/pr-02/web.json`、`.cache/pr-02/web-ui.json` 和 `.cache/pr-02/desktop.json`。

## PR-03 目录与资源验收

- T1-03 和 T1-06 交付 [Registry](../src/host/skin-registry.ts)与 [owner 路由](../src/host/catalogue-routes.ts)。`GET api/dsh-skin-engine/skins` 只读取内置和当前 profile 的 `skin-engine/packages/` 直接子目录中的 Manifest。每个 Manifest 上限 64 KiB，本地根目录最多 256 个条目。坏包独立报告，重复本地 ID 全部隔离，内置 ID 优先保留。点号开头的暂存目录跳过。
- 目录返回按 profile 和 Manifest 生成的修订号，以及按部署根解析的数据和预览 URL。`skin` 按需校验 Tokens 和 Effects。内置 CSS 随数据返回，受控本地 CSS 等 PR-08 完成解析器校验后开放。`asset` 支持 GET 和 HEAD，逐次校验声明路径、普通文件、真实路径、文件身份、5 MiB 上限和文件签名。缺失预览返回随包占位，私有响应使用 `no-store`。 [文件读取](../src/host/package-files.ts) · [媒体类型](../src/host/resource-type.ts)
- `npm run typecheck`、`npm run lint` 和 `npm test` 通过，13 项测试包含 100 份仅有 Manifest 的索引、目录链接及硬链接拒绝、超大文件和读取中断。请求取消与插件卸载均使进行中的读取返回 408 并关闭文件。卸载同时撤回全部路由。 [目录测试](../test/skin-registry.test.mjs)
- `npm pack --pack-destination .cache/pr-03` 生成 `dsh-plugin-skin-engine-0.0.2-catalogue.0.tgz`，SHA-256 为 `d5712dcb43158519dd3b0d3b5df1e6e1e9b6be626fcf4c850edabfe081e8742f`。同一包安装在官方 `0.2.2-rc.1` Web 的 `skin-engine-catalogue` 和 Windows Desktop 的 `desktop`。两端解码私有 PNG 与 320 × 180 占位。私有 GET/HEAD 为 200、HEAD 无正文、缓存为 `no-store`。Web 公开占位支持 immutable 与条件请求 304，Desktop 公开占位为 `no-store`。
- 两端伪装 MIME 返回 415，越界请求返回 404。Web 未认证为 401，跨站和非 owner 为 403。带 Web 修订号的同名资源请求在 Desktop 返回 404。Web 索引从 10 套本地数据扩至 100 套，本次 100 套响应约 945 ms。Web 热停用使三条业务路由和公开占位全部返回 404，恢复配置后均回到 200。两端验证了已取消的浏览器请求。正在读取时的 Host 取消由隔离夹具验证。实测记录位于 `.cache/pr-03/live.json` 和 `.cache/pr-03/hmr.json`。

## PR-04 静态切换验收

- T1-04、T1-05 和 T5-01b 交付设置页的预览、应用、取消预览和恢复 Default。预览仅在当前窗口生效，30 秒到期，取消、关闭设置和刷新后读取 Host 保存值。客户端用操作信号淘汰过期加载。应用先试挂载，再提交。挂载或保存失败恢复权威选择，恢复也失败则回到 Default。 [切换控制器](../src/client/skin-switch.ts)
- `GET api/dsh-skin-engine/selection` 和命名 POST `api/dsh-skin-engine/selection/apply` 在同一 profile 文件锁内打开存储领域、核对修订号、提交并关闭。写入返回失败时持锁重开领域并读盘确认。两个真实 Web Host 同时用同一修订号提交，返回 200 和 409，随后两端均读到胜者。持锁夹具进程退出后，真实 Host 接管锁并保留已存选择。若锁记录不完整或 PID 被复用，沿用官方锁的超时策略。 [Host 选择状态](../src/host/skin-selection.ts) · [DSH 文件锁](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/util/atomic-write/README.zh.md#use-this-package)
- 当前 Adapter 只映射已审计的背景和侧栏令牌，激活拥有 `data-dsh-skin-id` 和独立令牌层。浅色模式保留原生外观和保存选择，回到深色可恢复。两端用标记夹具验证活动壁纸、旧皮肤和外部让路标记会撤回引擎令牌，保留外部标记及保存值。实际参考插件组合沿用 PR-01 基线，PR-11 复测。 [令牌 Adapter](../src/adapter/skin-theme.ts) · [宿主审计](host-audit.md#t5-01a-参考插件共存)
- `npm run typecheck`、`npm run lint` 和 `npm test` 通过。18 项测试包括 A → B → A、预览超时、加载中卸载、挂载和恢复失败、丢失成功响应、持久化替换前后失败及修订号冲突。`npm pack --pack-destination .cache/pr-04` 生成 `dsh-plugin-skin-engine-0.0.3-switch.0.tgz`，SHA-256 为 `b09643e6f5052b8dfdc45ab32e1cf6cc9a2c1add665fb152b04e70915cfe52ee`。 [窗口测试](../test/skin-switch.test.mjs) · [Host 测试](../test/skin-selection.test.mjs)
- 同一包安装到官方 `0.2.2-rc.1` Web 的 `skin-engine-switch` 和 Windows Desktop 的 `desktop`。Browser plugin not available，使用 Playwright 连接 Chrome 和 Desktop CDP。两端通过 Default、Deep Ocean、Aurora、取消、关闭设置、刷新、浅深色回退和标记冲突验证。Web 额外注入 503 和提交后丢失响应，分别恢复 Deep Ocean 和确认 Aurora。Web 延迟预览期间热停用，路由返回 404，晚到请求未挂载皮肤，恢复后仅一个设置入口。Desktop 完全退出后重启，自动挂载已保存的 Deep Ocean。隔离记录位于 `.cache/pr-04/` 的 `web-ui.json`、`desktop-ui.json`、`desktop-restart.json`、`hmr.json` 和 `selection-concurrency.json`。

## PR-05 CSS 效果验收

- T2-01 和 T2-02 交付独立的 CSS 效果运行时。Deep Ocean 使用一层侧栏玻璃、两层极光和一条流光，流光支持背景与侧栏边缘预设，上限两条。主题令牌和装饰效果各自释放。设置页提供当前窗口的 Dynamic、Static、Economy 和 Off。隐藏状态暂停 CSS 动画，减少动态效果使用静态装饰，Economy 保留无模糊的静态极光，Off 恢复静态主题底色。 [CSS 运行时](../src/client/effects/p0.ts)
- 实测两端 AppFrame、正文列和官方对话外壳的底色。Adapter 仅对已核验的聊天路径开放装饰，挂载于宿主内容下方。玻璃以 CSS 锚点跟随展开侧栏，保留既有定位、层叠和输入路径。折叠侧栏、Web 抽屉、缺少滤镜或锚点时使用原生侧栏填充。全局面板撤回背景标记。 [宿主表面](../src/adapter/surface-map.ts) · [W3C 锚点定位](https://www.w3.org/TR/css-anchor-position-1/) · [W3C 绘制顺序](https://www.w3.org/TR/CSS22/zindex.html)
- `npm run typecheck`、`npm run lint` 和 `npm test` 通过，共 18 项本地测试。`npm pack --pack-destination .cache/pr-05` 生成 `dsh-plugin-skin-engine-0.0.4-effects.2.tgz`，SHA-256 为 `e49659e8e8d6264726b111f1f0a9bd356b06c455f8957afc5a27376135bc9086`。同一包安装到官方 Web 的 `skin-engine-effects` 和 Windows Desktop 的 `desktop`。Browser plugin not available，使用 Playwright 在 Web 1280 × 900、520 × 760 及 Desktop 1279 × 820 验证。
- 两端通过四档切换、减少动态效果、隐藏状态夹具、侧栏折叠与展开、原生输入和恢复 Default。默认复位后装饰、样式和表面标记均为零。Web 另测滤镜能力关闭、全局面板回退、两条锚定流光、外部壁纸标记和热停用。进入插件面板后的一次复位超过客户端 10 秒阈值，Host 已保存，客户端读回 Default。保留该场景供 PR-06 性能复测。隔离记录位于 `.cache/pr-05/` 的 `web-ui.json`、`desktop-ui.json`、`fallback.json` 和 `teardown.json`。

## PR-06 浮尘与性能基线

- T2-03、T2-04 和 T5-02a 完成首轮验收。浮尘使用一个共享 Canvas 2D 和按需调度器。Low、Balanced、High 的目标绘制频率分别为 20、30、60 FPS，DPR 上限为 1、1.5、2，最大粒子数为 24、56、96。Deep Ocean 的密度取满档以验证上限。Canvas 总像素限制为 8 Mi。Static 和 Reduced Motion 保留快照，Economy 使用 Low 档快照。Off、隐藏或离开已审计表面时释放绘图缓冲，停用与恢复 Default 时移除节点。 [调度器](../src/client/effects/frame-scheduler.ts) · [Canvas](../src/client/effects/canvas.ts) · [质量预算](../src/client/effects/quality.ts)
- `npm run typecheck`、`npm run lint` 和 `npm test` 通过，共 21 项测试。新增用例覆盖共享时钟、暂停恢复、空闲回收、DPR 与像素上限和粒子连续性。`npm pack --pack-destination .cache/pr-06` 生成 `dsh-plugin-skin-engine-0.0.5-dust.0.tgz`，SHA-256 为 `218f4ae2d3522a0d8301c8bd57d6e56562522b672cadd31d37e911d85d233e00`。同一预构建包安装到官方 `0.2.2-rc.1` Web 的 `skin-engine-dust` 和 Windows Desktop 的 `desktop`。Browser plugin 不可用，本轮用 Playwright 操作 Chrome 与 Desktop CDP。 [效果运行时测试](../test/effects-runtime.test.mjs)
- 测量设备为 Windows 11、Intel i5-13500H、Intel Iris Xe、15.7 GiB 内存。Web 和 Desktop 的 CSS 视口分别为 1280 × 900 和 1279 × 820，两端报告设备 DPR 2。每种状态采样 6 秒页面 RAF、12 次编辑器键入和 4 次侧栏折展。输入与侧栏延迟测到下一次 RAF，页面帧间隔取渲染器 RAF 时间戳。表中堆为采样末尾的 JS 堆快照，主线程任务耗时累计涵盖帧采样与两组交互。

| 宿主 · 状态 | 帧间隔 P95 ms | 输入 P95 ms | 侧栏 P95 ms | 主线程任务 ms | JS 堆 MiB | 浮尘绘制 FPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Web · Default | 16.9 | 16.4 | 13.8 | 610 | 29.0 | 0 |
| Web · Deep Ocean 关闭效果 | 16.9 | 15.9 | 22.5 | 738 | 26.9 | 0 |
| Web · Balanced 四项 P0 | 16.9 | 16.5 | 13.7 | 854 | 27.3 | 30.0 |
| Desktop · Default | 16.9 | 16.7 | 14.4 | 579 | 37.1 | 0 |
| Desktop · Deep Ocean 关闭效果 | 16.9 | 17.1 | 15.6 | 611 | 31.0 | 0 |
| Desktop · Balanced 四项 P0 | 16.9 | 22.0 | 23.6 | 1198 | 39.7 | 29.7 |

- 两端均未观测到长任务。Balanced 各有一个不截获指针的 Canvas、56 粒子、三条 CSS 动画和五个效果层。Canvas 缓冲尺寸分别为 1920 × 1350 和 1918 × 1230，按每像素 4 字节约为 9.9 和 9.0 MiB。关闭效果后 Canvas 为 0 × 0，恢复 Default 后装饰、样式和表面标记均为零。同端重复采样时，以 Default 为参照，帧间隔、输入或侧栏 P95 持续增加超过 16.7 ms，或反复出现长任务，均进入回归排查。Desktop 四项同开时累计任务耗时约为 Default 的两倍，后续质量档复测继续跟踪。
- Desktop 以官方渲染器的可见性夹具持续隐藏 300 秒，三条 CSS 动画暂停，Canvas 缓冲归零且绘制计数保持不变。恢复首帧的粒子位置与暂停前一致。真实窗口切到后台的五分钟测试留待发布回归。Web 通过 10 次预览和取消、热停用和重新启用。全局插件面板释放 Canvas 缓冲，复位本次约 9.1 秒，低于客户端 10 秒阈值。隔离证据位于 `.cache/pr-06/` 的 `web-performance.json`、`desktop-performance.json`、`visibility-5min.json` 和 `web-lifecycle.json`。

## PR-07 管理器与偏好验收

- T3-01、T3-02 和 T3-03 交付设置槽中的画廊和详情。支持搜索、标签和来源筛选、兼容原因和坏包诊断。卡片由目录元数据渲染，图片按需请求，缺图用占位。详情按需读取包数据。当前在画廊显示受控本地目录的元数据，外部包激活随 PR-08 的安全校验开放。 [画廊](../src/client/skin-panel.tsx) · [详情](../src/client/skin-detail.tsx)
- 可编辑已映射的背景、侧栏填充、粒子颜色、皮肤质量档和四项 P0 开关与强度。设置页保留当前窗口的效果模式和质量覆盖。Reset preferences 将草稿恢复为随包默认值，Apply 确认后写入 Host。切回 Default 保留已存偏好。预览、取消或关闭设置均沿用窗口级切换事务。 [参数合并](../src/shared/preferences.ts) · [切换控制器](../src/client/skin-switch.ts)
- 偏好与选择共用 profile 锁、修订号和原子写入，按 skinId 存储。Host 拒绝无效色值、强度越界、未声明的效果和过期修订号。存储领域 v2 接受 v1 的选择记录，首次成功修改后写入 v2。回装只支持 v1 的旧版本前须恢复相应的旧版存储快照，M5 验证该恢复流程。 [领域实现](../src/host/skin-selection.ts) · [偏好校验](../src/host/preference-schema.ts)
- `npm run typecheck`、`npm run lint` 和 `npm test` 通过，共 23 项测试。新增同一皮肤修改偏好的失败复原、成功响应丢失、旧选择读取和并发更新测试。最终预构建包为 `.cache/pr-07/dsh-plugin-skin-engine-0.0.6-manager.1.tgz`，SHA-256 为 `53bf7aec0dd67f3735347a5d942050e4aec72c6bc33e80fc87361a4cee1cb4f7`。
- 两端先在 `0.0.5-dust.0` 保存 Deep Ocean，再安装 `0.0.6-manager.0`，选择和修订号保持一致。修订包 `manager.1` 在 Web 的 `skin-engine-dust` 和 Desktop 的 `desktop` 复验。Desktop 经原生插件管理器卸载和安装，启用后需完整重启应用才能加载新版 Client。Browser plugin 不可用，使用 Playwright 在 Web 1280 × 900、520 × 760 和 Desktop 1279 × 820 验证。
- 两端通过搜索和标签、预览取消、关闭设置还原、保存后刷新、重置和浅色回退。Low 档预览实测玻璃模糊上限 8 px。Web 另测不兼容包、损坏 Manifest 和同一皮肤的过期偏好草稿，过期写入返回 409，界面读回胜者。两端无未捕获页面异常。隔离记录位于 `.cache/pr-07/` 的 `seed-web.json`、`seed-desktop.json`、`web-ui.json` 和 `desktop-ui.json`。

## PR-08 包管理与安全验收

- T3-04 交付 owner 专属的 ZIP 导入、导出和卸载。导入按 512 KiB 分块写入当前 profile 的同卷暂存目录，Host 逐块限长并确认偏移。每个 Host 最多两个上传会话，空闲 120 秒自动回收。取消通过独立请求中断 Host 工作，等待文件关闭和暂存清理后返回。断线重连后可以从头重试。 [上传路由](../src/host/package-upload.ts) · [包管理](../src/host/package-management.ts)
- 限压缩输入 21 MiB、解压总量 20 MiB、单文件 5 MiB、Manifest 和 CSS 各 64 KiB、256 条目、包内深度 8、单条目最大压缩比 200。拒绝绝对和越界路径、Windows 设备名和数据流、大小写冲突、链接、加密条目、CRC 错误、未声明文件和伪装素材。图片限制每边 4096 px 且总像素不超过 8 Mi。 [ZIP 校验](../src/host/zip-archive.ts) · [素材校验](../src/host/resource-type.ts) · [Yauzl](https://github.com/thejoshwolfe/yauzl)
- 外部 CSS 用 CSSTree 解析。根规则仅允许包作用域和受限变量，装饰规则仅允许引擎的背景图载体、声明过的同包图片路径、尺寸和有界不透明度。拒绝转义、远程和编码 URL、`data:`、嵌套规则、`@import` 及布局和交互样式。Client 只使用验证得到的参数，图片先经 owner 路由解码，再交接渲染。 [CSS 校验](../src/host/skin-css.ts) · [CSSTree](https://github.com/csstree/csstree/blob/master/docs/parsing.md)
- 校验后持 profile 锁核对 ID 并原子发布。卸载活动包时先提交 Default，再移出目录。导出默认省略资源、相关背景规则和用户偏好，用户可分别选择包含。随包偏好作为可审阅草稿，确认应用时保存。原有受控目录可发现，ZIP 安装目录才开放外部包激活。 [包管理界面](../src/client/package-controls.tsx) · [Yazl](https://github.com/thejoshwolfe/yazl)
- `npm run typecheck`、`npm run lint` 和 `npm test` 通过，共 28 项。新增测试覆盖解包与 CSS 负例、活动选择写入失败、并发重复 ID、偏好与私有资源导出、活动读取取消。最终预构建包为 `.cache/pr-08/dsh-plugin-skin-engine-0.0.7-packages.1.tgz`，SHA-256 为 `753cd1a0d1edd1fd2140b6ac20c2c89c8237a52308fd3ea3b4141b3881bd9959`。 [测试](../test/package-management.test.mjs)
- 同一包安装到官方 Web 的 `skin-engine-packages` 和 Windows Desktop 的 `desktop`。Desktop 从原生插件管理页换包后完整重启。Browser plugin 不可用，Playwright 实测两端导入、图片预览、随包偏好、下载、活动包卸载和重新导入。跨 profile 资源为 404，非 owner 的三个包路由均为 403。Web 未认证为 401，两端伪造 Origin 的导入请求为 403，Desktop 伪造 Origin 的导出也为 403。
- 两端上传 512 KiB 后在发出下一块前取消，Host 确认后暂存目录为空。Web 另测 128 字节已写入、请求体仍打开时发送取消，原上传为 408，暂存清空。非法 CSS 两端均拒绝。隔离证据位于 `.cache/pr-08/` 的 `web-ui.json`、`desktop-ui.json`、两份 `peer-*.json` 和 `transport-and-isolation.json`。

## PR-09 P1 效果验收

- T4-01、T4-02 和 T4-03 交付点击涟漪、星空和虹彩玻璃。Obsidian Neon 将三项 P1 与液态玻璃组合。偏好支持三项独立开关及半径、亮度和强度调整。Host 存储升至 v3 并兼容读取 v1、v2，Desktop 换包后读回 PR-08 保存的偏好。 [样板配置](../DSH_Skin_Engine_Development_Pack_v1.0/examples/skins/obsidian-neon/effects.json) · [偏好](../src/shared/preferences.ts)
- 涟漪由已审计对话背景的被动点击监听触发。最多保留四组，每组一至三圈，排除编辑器、交互控件和选中文本，按实际经过时间淘汰。仅涟漪时，空闲与隐藏均释放绘图缓冲。星空与浮尘共用粒子模型、Canvas 和调度器。星数上限为 Low 32、Balanced 72、High 120。 [涟漪](../src/client/effects/ripple.ts) · [星空](../src/client/effects/starfield.ts)
- 虹彩只挂在经审核的展开侧栏。指针坐标经共享调度器合并后写入装饰节点的局部变量。单独启用虹彩时使用原生侧栏颜色的填充。Low、Economy、Static 和 Reduced Motion 保留静态星空和虹彩，停用涟漪。折叠侧栏或宿主载体退出后撤回装饰。 [虹彩](../src/client/effects/holographic.ts) · [效果运行时](../src/client/effects/p0.ts)
- `npm run typecheck`、`npm run lint` 和 `npm test` 通过，共 31 项。新增用例覆盖星点上限和回到空闲、涟漪容量和超时、虹彩局部写入与回收。预构建包为 `.cache/pr-09/dsh-plugin-skin-engine-0.0.8-p1.0.tgz`，SHA-256 为 `a8953c62a0a73cc5ed9032c2f4d1356e735ae303af5e1c438a8a9b678e6c4e40`。 [运行时测试](../test/effects-runtime.test.mjs)
- 官方 Web `skin-engine-p1` 和 Windows Desktop `desktop` 安装同一包。Browser plugin 不可用，使用 Playwright 在 1280 × 900 和 1279 × 820 实测。Obsidian Neon 在 Balanced 档各绘制 64 星点，Canvas 约 30 FPS，页面帧间隔 P95 分别为 16.8 和 16.9 ms。连续点击同一帧最多四组共十二圈，两端均通过原生输入、菜单、侧栏折展、各效果单开、降级、隐藏夹具和恢复 Default。记录位于 `.cache/pr-09/` 的 `web-ui.json` 和 `desktop-ui.json`。
- 两端通过已安装的混合效果包验证同一 Canvas 分别绘制 Low 的 24 浮尘与 32 静态星点、Balanced 的 56 浮尘与 72 星点、High 的 96 浮尘与 120 星点。Web 520 × 760 抽屉模式撤回虹彩并保留背景 Canvas。活动测试包卸载后，刷新显示 Default。记录位于同目录的 `web-mixed.json` 和 `desktop-mixed.json`。

## PR-10 折射与自动质量验收

- T4-04 和 T5-02b 交付可选 Liquid Refraction 及 Auto。Deep Ocean 声明折射参数，用户在详情主动启用后可预览或保存。皮肤自带的启用声明仍受用户偏好控制。偏好领域升至 v4，继续读取 v1 至 v3。 [偏好合并](../src/shared/preferences.ts) · [Deep Ocean 配置](../DSH_Skin_Engine_Development_Pack_v1.0/examples/skins/deep-ocean/effects.json)
- 折射只读取引擎生成的 128 × 128 纹理，在已审计背景层上绘制。画布按材质配置与窗口预算共同限幅，Balanced 上限 524,288 像素。初始化失败、上下文丢失或降档时切到 CSS。上下文恢复后重建 GPU 资源。隐藏、Off 或离开安全表面时释放 GPU 层，Reduced Motion 与 Static 使用 CSS 背景。 [折射实现](../src/client/effects/refraction.ts) · [WebGL 上下文丢失扩展](https://registry.khronos.org/webgl/extensions/WEBGL_lose_context/)
- Auto 以 Balanced 开始。24 个样本中至少 8 次帧间隔超过约 45.3 ms 或引擎工作超过 8 ms 即降 Low。Low 观察 80 个样本，单帧引擎工作超过 4 ms 或间隔超过 100 ms 时重置观察，间隔超过 70 ms 的样本最多 8 个。初版 Desktop Low 采样中，115 个间隔有 15 个超过 58 ms，放宽后可容纳一次 60 Hz 刷新周期的抖动。纯 CSS 动画由同一个时钟采样，静态和空闲不采样。 [Auto 策略](../src/client/effects/auto-quality.ts) · [共享时钟](../src/client/effects/frame-scheduler.ts)
- `npm run typecheck`、`npm run lint` 和 `npm test` 通过，共 34 项。预构建包为 `.cache/pr-10/dsh-plugin-skin-engine-0.0.9-refraction.1.tgz`，SHA-256 为 `6f0ab47d031307c2f582eaec7ce8623e950303b089fc408fa93a3236f6f271a8`。同一包装入官方 Web 的 `skin-engine-refraction` 和 Windows Desktop 的 `desktop`。 [运行时测试](../test/effects-runtime.test.mjs)
- 两端用 Intel Iris Xe 和 ANGLE D3D11 读取实际变化的折射像素，并验证默认零 WebGL 分配、预览取消、真实上下文丢失与恢复、创建失败和编译失败夹具、Reduced Motion 及隐藏夹具。Playwright 采样约 2.6 秒，Web 的 P0 与 P0 加折射帧间隔 P95 分别为 16.9 和 16.8 ms，Desktop 均为 16.9 ms。组合中 Web 77 次、Desktop 78 次的 WebGL 和 Canvas 2D 绘制均在同一引擎 RAF 回调内。两端无未捕获页面异常。
- 注入每帧 12 ms 的 Canvas 负载后，Web 与 Desktop 分别约 0.78 和 0.90 秒降 Low。卸载压力后分别约 4.53 和 4.65 秒恢复 Balanced 及折射。Desktop 另验纯 CSS 动画只在 Auto 动态模式采样。记录位于 `.cache/pr-10/` 的 `web-ui.json`、`desktop-ui.json` 和 `css-auto.json`。

## PR-11 发布回归

- 首轮 v1 产物位于 `.cache/pr-11/release/`，最终候选产物位于 `.cache/pr-11/aurora-candidate/`，均包含 `dsh-plugin-skin-engine-1.0.0.tgz` 及三套 `.dshskin.zip`。引擎包含 Host、lazy-CJS Client、bundle patch、三份真实深色预览及构建生成的第三方许可文本。独立样板使用 `.sample` 后缀的 ID，可与内置同主题并存。最终候选包通过构建、类型检查、lint 和 35 项测试。 [素材与许可](release-asset-notes.md) · [样板打包](../scripts/pack-samples.mjs)
- 官方 Web 和 Windows Desktop `0.2.2-rc.1` 在全新 profile 安装同一候选包，均验证三套样板的导入、预览、应用、浅色回退和卸载。Web 完成 100 次预览与取消切换及 10/100 个本地包的元数据扫描。安装步骤、回滚步骤与各项复验状态汇总在 [v1 安装与验收](release-v1.md)。
- Web 已复验旧包升级和回装、ZIP 安全负例、未认证与跨站请求拒绝，以及 Wallpaper Engine 和 Maid Atelier 的让路行为。活动轮播连续切换，引擎保留自己的保存选择，在清空壁纸并重新打开页面后恢复。Desktop 实测后台 300 秒，CSS 暂停且 Canvas 零绘制，经宿主唤回后恢复。 [候选包复验进度](release-v1.md#候选包复验进度)
- Desktop 已补齐 10/100 包元数据、100 次切换、引擎监听器清理、ZIP 安全负例和原生面板换包回滚。两端通过真实窗口的 300 秒后台暂停与恢复、实际参考插件共存及非 owner 请求拒绝。性能初测两端空闲帧间隔 P95 为 16.9 ms，P0 输入延迟增量超过排查线。 [验收矩阵](release-v1.md#候选包复验进度) · [性能复验](release-v1.md#性能复验)
- 性能修订候选包已在两端安装，复验三套样板、交互暂停、动画续播、Canvas 持续绘制、Reduced Motion、五分钟后台暂停与恢复。两端输入延迟及 Web 配对侧栏差值回到排查线内。Desktop 侧栏仍有两组超线，继续排查布局成本。 [性能修订候选包](release-v1.md#性能修订候选包)
- 网格定位候选包已在两端验证三套样板、玻璃像素效果、边缘流光、折展、缩放、100 次切换和真实窗口后台 300 秒恢复。Web 侧栏通过配对复测。Desktop 布局耗时回到 Default 附近，可信坐标复验仍有两组侧栏延迟超线，继续定位慢帧。 [网格定位候选包](release-v1.md#网格定位候选包)
- Desktop 慢折展已定位到宿主 `ui-dockkit` 在 React 布局副作用中同步测量停靠面板。两轮 Default 和 P0 均命中同一重算路径。保留原性能门槛，继续用配对样本验证 P0 额外开销。 [逐次点击追踪](release-v1.md#网格定位候选包)
- 网格定位包的两种 CSS 动画暂停替代方案均在 Desktop 与 Default 配对时重复超线。标题栏规则隔离也未缩小 DockKit 同步重算的元素范围。 [对照结果](release-v1.md#网格定位候选包)
- Desktop 逐项对照中，关闭极光在两轮均降低侧栏 P95，优先检查极光滤镜与动画变换的合成开销。发布验收仍以四项效果全开为准。 [单项效果对照](release-v1.md#网格定位候选包)
- 极光缓存候选包在官方两端安装并通过图像解码、回退、动画和清理复验。Web 四项 P0 全开的帧间隔、输入与侧栏 P95 增量均在排查线内。 [极光缓存候选包](release-v1.md#极光缓存候选包)
- Desktop 输入追踪在 Default 和 P0 均定位到官方编辑器的选区更新和滚动区尺寸读取。早期有一次混合对照的输入及侧栏 P95 超线。单独调整玻璃滤镜、覆盖层绘制、侧栏底色和引擎发起的样式读取均未取得可重复收益。 [对照与追踪](release-v1.md#极光缓存候选包)
- 极光缓存包在两端通过三套 ZIP、各 100 次切换、真实后台 300 秒暂停与恢复、热启停和窗口缩放。Desktop 另确认窗口持续可见后的缓存重建及参考插件让路。 [生命周期证据](release-v1.md#极光缓存候选包)
- T5-01c、T5-03 和 T5-04 完成本地验收。Desktop 在正常启动下完成三轮 Default、静态与 P0 对照。相对同轮 Default，P0 的帧间隔 P95 不变，输入和侧栏 P95 最大增量分别为 3.2 和 8.6 ms，低于 16.7 ms 排查线。 [最终性能复测](release-v1.md#desktop-最终性能复测) · [支持矩阵](release-v1.md#候选包复验进度)
