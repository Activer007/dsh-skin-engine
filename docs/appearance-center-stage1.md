# 外观中心第一阶段：实施与验收台账

## 基线与范围

- Skin Engine：`76baaeaf7749303838c25457d147048909015591`（PR #44，1.8.2）。
- 官方 DSH：`dsh-v0.2.2-rc.1`，`66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`。
- 来源：2026-11-13《DSH Skin Engine Appearance Center Plan》。本文件落实其 P0，不替代原规划。
- 不制作独立皮肤编辑器，不增加市场、不接 Worktable、不改宿主、不重建 SkinSwitch 或 EffectsRuntime。
- 本轮先新增原生入口和空面板；现有设置中的皮肤库、特效和包管理全部保留。不能将此 PR 称为“迁移已完成”。
- 收藏、最近使用、排序、持久暂停引擎及 Worktable/Wallpaper 共存属于后续 P1。

## 按依赖拆分的开发计划

| 顺序 | 任务 | 子任务与出口 |
| --- | --- | --- |
| 0 | NAV-R01 官方槽位探针 | 锁定版本；核对 main 的 key 与侧栏 id；官方依赖与销毁机制；隔离 Web 1280/760 CSS px 和 syh Windows 探针；保留截图、候选 hash、失败记录。 |
| 1 | NAV-01 入口 | 注册普通侧栏与同 ID main；中英文标题；无业务副作用的返回聊天；原生 More/取消固定；卸载恢复聊天；旧设置完整保留。 |
| 2 | NAV-02 共享展示 | 抽取皮肤库与详情；搜索/标签/兼容筛选；明暗大图；宽窄布局与返回焦点；复用唯一 controller，未应用编辑不保存。 |
| 3 | NAV-03 会话与事务 | 外观 UI 草稿独立于设置 modal；包事务提升到应用生命周期；导航不 abort 上传；显式取消/插件卸载正确取消；未知提交结果通过 Host 回读；冲突与幽灵进度测试。 |
| 4 | NAV-04 功能迁移 | 迁移九种皮肤特效与 ZIP 导入/导出/更新/回滚/卸载；Web 与 Desktop 文件选择；单一事务状态，不复制整块 JSX；保留冲突处理。 |
| 5 | NAV-05 真实预览 | 静态详情与聊天真实效果明确分开；官方返回聊天、确认聊天可见后开始现有 30 秒预览；应用/取消/超时工具条；键盘和导航/关闭竞争。 |
| 6 | SYS-01 设置瘦身 | 仅保留当前窗口特效模式/质量、系统适配、诊断、紧急恢复；不把 off 误写为全局引擎暂停；清除图库残留与宽度样式。 |
| 7 | NAV-06 集成出口 | 同一候选完成 Web/Windows、明暗/高对比、中英、键盘；更新使用手册/路线图；100 包懒加载/无多余常驻 RAF；卸载无残留；清楚记录未验范围。 |

## NAV-R01：官方源码已确认的契约

下列结论来自固定 rc.1 源码，不代表真实操作已经通过。

- `packages/client/ui-plugin-manager/src/client/index.ts`：`main` 使用 `key`；`sidebar.panellist` 使用 `id`，两者必须同值。
- `packages/client/ui-plugin-manager/package.json`：客户端 manifest 需依赖 `@deepseek-ai/dsh-client-ui-layout` 与 `@deepseek-ai/dsh-client-ui-sidebar`。
- `packages/client/ui-sidebar/src/client/contract/slots.ts`：侧栏负责按钮、标签、固定状态与键盘操作；插件仅提供 `{ size, active }` 图标，不自包 button。
- `packages/client/ui-layout/src/client/service.ts`：`layout.selectPanel(null)` 返回聊天，不需要改 session。
- `packages/client/ui-layout/src/client/stores.ts`：已选 main 被移除时宿主回到聊天。插件必须交回注册生命周期，不能另留全局监听。
- `packages/client/ui-layout/src/client/AppFrame.tsx`：打开 main 有 `data-global-panel`，特效会让位。静态预览不能当真实聊天效果验收。
- `shell.bottom` 是单槽；rc.1 已有 additive `shell.overlay`。NAV-05 必须另做冲突和可见性验证，当前不提前占槽。

## NAV-01 实现边界

新增 `dsh-skin-appearance` 成对注册与空面板。外观中心根选择器为 `data-dsh-skin-appearance`，不复用设置页的 `data-dsh-skin-engine`。页面明确提示功能仍位于设置，不放不可用的“应用”按钮。

语言注册移至插件生命周期，而不是首次打开设置时才注册。新增布局/侧栏客户端依赖，运行时声明 layout/locale。仍然只有原来的一套皮肤 controller 与 effects runtime。

本轮不触碰以下已知风险模块，留给 NAV-03：

1. `settings-session` 依赖 modal DOM，关闭时清草稿并取消预览。
2. `package-operations` hook 卸载会 abort。
3. 直接把 SkinPanel 挂到 main 会错误触发以上生命周期；禁止用此捷径“完成迁移”。

## NAV-01 本机验收

- 补丁 SHA-256：`8868d0b18f4abbe129ed97c8f649687fca328656cd8ab3656911583b0c35fc3f`。补丁基线与应用时的远端 main 一致。
- 候选代码与验收脚本提交：`18b7a46d792cf6aac6b840b38e21fbb60d708331`。执行 `npm run verify:local -- trusted-commit <提交> <输出目录>`，完整类型检查、lint、74 项测试、构建及 27 份可复现归档通过。日志在 `.cache/nav-01/verify-final/verify-cAwtnM/`。
- 双端使用上述干净构建的同一 tarball，SHA-256 为 `d306234ebe21ff0553d36faffcc87f4c8a5e65d3cc4c58ee198618cc673db87`。沿用 [验收命令](acceptance.md#运行)，指定 `--suite settings-navigation` 和官方 DSH `0.2.2-rc.1`。Web 结果目录为 `.cache/nav-01/repro-host/web-Y3InAy/`，Windows Desktop 为 `.cache/nav-01/repro-host/desktop-pBoUuR/`。
- 证据包括 `appearance-en-1280.png`、`appearance-zh-760.png`、`chat-after-disable.png`、`settings-conflict.png` 和 `result.json`。覆盖进入外观中心、返回同一聊天、切换插件面板、双语、窄窗、选中面板时禁用，以及原设置的草稿、预览和包修订冲突恢复。
- 首次 Desktop 在隔离 profile 初始化时抛出 `BrowserWindow is not a constructor`，当时尚未安装候选包。原版 UI-09 1.8.2 对照通过，NAV-01 后续复跑通过。根因未确认，原始日志保留在 `.cache/nav-01/host/desktop-0TDs2v/electron-user-data/logs/`。
- 官方默认 More 菜单仅提供浏览和创建插件。本轮依照宿主原生入口契约，固定状态由宿主管理，跨重启持久化不在验证范围内。

## NAV-02–04 合并批次：共享工作区与导航安全

### 基线与本批目标

开发基线为 PR #45 合并后的 `3c611217569f109f081df6523b387471748ac3fa`。上面的 NAV-01 同候选 Web/Windows 证据仍然有效，但不能覆盖本次新增工作区和事务生命周期。初次 Desktop `BrowserWindow is not a constructor` 发生在候选安装前，对照与复跑通过，保留原环境问题记录，不据此修改业务代码。

用户允许中大型 PR，本批按依赖合并 NAV-02、NAV-03、NAV-04 的实现。云端独立开发后交 **LHA 的本地 Codex** 应用补丁、完整验证、创建 PR、审查和必要修复、合并。不得把“客户端定向测试通过”写成“全阶段完成”。

### 子任务与实现

1. **共享工作区**：原皮肤库、详情、九种特效控制、包管理迁入 `SkinWorkspace`。设置页和外观中心是两个薄入口，共用组件、唯一 SkinSwitch、唯一 EffectsRuntime 和唯一 PackageOperationsStore，不复制整段页面。
2. **独立草稿会话**：`AppearanceSession` 只保存本窗口 UI 状态，包括选中、效果编辑对象、各包草稿、页签、搜索、标签、来源、兼容筛选和窄屏详情状态。导航卸载视图不清除；显式放弃清单包草稿；插件卸载清全部。不会自动写 Host。
3. **保留设置兼容语义**：旧设置继续用自己的会话，关闭 modal 仍清除设置草稿并取消旧设置预览；不会清外观中心草稿。`attach()` 只在设置入口执行，外观中心不探测 modal DOM。
4. **应用级包事务**：上传/导入/更新/导出/回滚/卸载由插件级 store 持有。所有入口共用同步并发锁；UI 离开/订阅取消不 abort；显式取消保持 Host 回读，结果不确定不伪称成功；插件卸载先标记 disposed，再 abort，不再回读或发布晚到结果。
5. **安装后选择一致**：成功安装回读验证后，发起导入的入口选中新包并清筛选。此为显式安装产生的 UI 更新，不保存皮肤或改动其他包草稿。两入口可能同时挂载，但仍只有一个包事务。
6. **语言与样式隔离**：操作通知存翻译函数，语言切换后显示新语言。共享内容样式改用 `data-dsh-skin-workspace`；原设置 modal 的宽度规则仍仅用于设置；外观中心保持独立根和自己的滚动容器。

### 预览与设置瘦身边界

- **NAV-05 未完成**：外观中心展示静态大图、可编辑并显式“应用”，但不出现“预览”按钮，也不会在聊天隐藏时启动 30 秒倒计时。页面直接说明真实聊天预览需先返回聊天，再打开设置操作，避免 main 的 `data-global-panel` 让聊天效果隐藏。应用保存后可“返回聊天”查看实际效果。
- `persistentDrafts` 与 `previewAvailable` 为独立参数。下一批接入聊天真实预览无需改变草稿生命周期。
- **SYS-01 未完成**：暂时保留完整旧设置作为兼容入口，不能提前删除旧预览、包操作和诊断。完成 NAV-05 后再收窄为运行模式、诊断与紧急恢复。
- **NAV-06 未完成**：最终候选集成矩阵、清理和文档出口在后续完成。

### LHA 验收

- 补丁 SHA-256：`77eb5d63223a2f3ac227f0b4bed8edcb206d0abcef0384be13a7647c2586f31f`。使用独立工作树。
- 候选 `b6643aff508e60fdeb1cbfc78e41857c4af467d3`。执行 `npm run verify:local -- trusted-commit <候选 SHA> <输出目录>`，类型检查、lint、构建、88 项测试和归档复现通过。报告在 `.cache/nav-02-04/verify/verify-n9pRoT/result.json`。
- 同一候选 tarball SHA-256：`2860e3c013ea73de5fb60961201880a1cfb6aad6befc774a5544882907883faf`。按 [运行说明](acceptance.md#运行) 指定 `--suite settings-navigation`，在官方 DSH `0.2.2-rc.1` Web 与 Windows Desktop 使用隔离配置实测。
- 双端通过三页、中英文、草稿与筛选跨面板保留、设置与外观中心草稿隔离、显式应用、暂停上传后导航及继续、取消后 Host 清理、更新、回滚、卸载、禁用插件后恢复聊天。外观中心只显示静态图，聊天隐藏时原设置预览禁用并提示返回聊天。原设置回归还覆盖 409 与包修订冲突。
- 证据目录为 `.cache/nav-02-04/host/web-fkU4vL/` 和 `.cache/nav-02-04/host/desktop-r8LSrc/`，各含 `appearance-en-1280.png`、`appearance-zh-760.png`、`chat-after-disable.png`、`settings-conflict.png` 和 `result.json`。无未捕获页面异常。两端记录了预期冲突 409，Desktop 另有一条通用资源加载错误，与 NAV-01 隔离测试记录一致，未阻断验收。隔离进程均已退出。
- 本轮定向验收未重跑全量性能、后台采样、原生保存和强制颜色矩阵。包事务在插件卸载后对迟到响应的抑制由本地测试覆盖。

## NAV-05 聊天真实预览

- 外观中心的预览请求通过官方 layout 返回聊天，等待输入承载面可见，再交给原 SkinSwitch 事务。应用核对 Profile 与皮肤包修订。预览操作条使用追加式 shell.overlay，保留 shell.bottom 给宿主及其他插件。
- 候选提交 `097d5b3bbbe23d277fb72bf835056c01342fcbab`。tarball SHA-256 `208110255fa779edc2dad1c211770a3399bf732762a9884ef9b5684c42d57afe`。类型检查、lint、构建打包及 28 项定向测试通过。
- 官方 DSH `0.2.2-rc.1` 双端通过 `--suite settings-navigation`。Web 在 `.cache/nav-05/host/web-D8yTeV/`，Windows Desktop 在 `.cache/nav-05/host/desktop-NfbHgY/`。两端验证从外观中心回到原聊天、取消、切面板取消、到期恢复、应用写回和旧设置回归。Web 与 Desktop 分别在 30.308 和 30.254 秒到期。无未捕获页面异常。目录含 `chat-preview-1280.png` 及 `result.json`。
- 使用独立宿主配置。未安装 Worktable 做专项视觉对照，完整发布级性能与长后台采样仍留到发布关口。

### 审查修订与复验

外观所有权冲突此前会清掉预览状态，但不一定把冲突原因传给操作条。修订后保留 Host 回读和冲突提示，释放请求，使用户能再次启动预览。

- 冲突修订候选 `4d7ac36a0a3e79d5c704dc1f87a056c7384de460`，tarball SHA-256 `117db94ff7704c257082d4accf3879e6b94d2f8e51136f26096702316e943161`。完整 `verify:local` 通过，包括 88 项测试，目录 `.cache/nav-05/verify/verify-campKY/`。
- 官方 Web 与 Windows Desktop 同包复跑通过，含外观冲突后提示及重新启动。证据在 `.cache/nav-05/verified/web-N33ZeX/` 和 `.cache/nav-05/verified/desktop-evSRRA/`。两端无未捕获页面异常，Desktop 记录了一条既有的通用资源加载错误。
- 预览归属修订候选 `c5bedbfa560775f7214ef6cbf1844299a84a9449`。当旧设置发起预览时，聊天操作条释放请求。实测旧设置可接管同一皮肤的预览，关闭设置后恢复已保存外观。Web 和 Windows Desktop 到期分别为 30.269 秒和 30.372 秒。
- 完整 `verify:local` 通过，含 88 项测试及 27 份可复现归档。报告在 `.cache/nav-05/verify/verify-0u8DXq/result.json`。双端使用候选工作树的同一 tarball，SHA-256 `c657c3b5dcefa0cb68403479db6e01aaca63417baa799ec3e5cb336d525c519e`。截图和宿主报告在 `.cache/nav-05/handoff-host/web-5wzbnB/` 和 `.cache/nav-05/handoff-host/desktop-YLyhqD/`。两端无未捕获页面异常。隔离宿主均已退出。

## SYS-01 设置瘦身

- DSH 设置页恢复原生宽度，仅显示窗口特效、紧急恢复和诊断。窗口级关闭只改变当前窗口的特效，当前配置保存的皮肤及偏好不变。
- 设置页可主动取消聊天预览。关闭设置不影响正在进行的聊天预览。恢复默认外观需要确认，清除已保存的皮肤选择并保留皮肤包与各皮肤的偏好。
- 外观中心保留皮肤库、皮肤专属特效和皮肤包管理。其草稿与筛选继续跨导航保留。目录刷新及具体皮肤包问题仍在「外观中心 → 皮肤管理」，Host 版本检查留在设置页。
- 实现提交 `0b90482dba88a99333de2a7744b2e042c0fdf5c6`。本地 `npm run typecheck`、`npm run lint`、`npm pack` 及 21 项导航、会话、皮肤切换和诊断定向测试通过。
- 官方 DSH `0.2.2-rc.1` Web 与 Windows Desktop 使用同一归档（SHA-256 `b5bf8cd7a7bff55eb56bd00e66ff1ce2e168e5201cb4f5dba973251c671dc493`）。通过中英文设置、窗口模式及质量、Host 检查、关闭设置后预览保留、显式取消、二次确认恢复且偏好保留、外观中心草稿与 ZIP 导入。常规视口两个设置弹窗均为 800 CSS 像素宽，窄窗无横向溢出。
- Web 截图和结果在 `.cache/sys-01/verified/web-Cuznhp/`，Windows Desktop 在 `.cache/sys-01/verified/desktop-ZfQL09/`。两端无未捕获页面异常。Desktop 记录了一条通用资源加载错误，隔离宿主均已退出。
