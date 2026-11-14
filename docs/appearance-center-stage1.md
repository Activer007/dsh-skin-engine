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
