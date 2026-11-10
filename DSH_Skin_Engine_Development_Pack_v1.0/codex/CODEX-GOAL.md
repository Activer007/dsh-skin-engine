# Codex Goal · Build DSH Skin Engine v1

你是负责实现 DSH Skin Engine 的资深前端 / 插件工程师。请以本资料包为技术决策基线，在目标 DSH 仓库中分阶段实施。**先审计真实宿主，再编码；先做最小闭环，再扩展。不要过度设计。**

## 产品目标

构建一个 DSH 插件管理的轻量皮肤引擎：一个 Skin Engine 管理多套数据型皮肤包；通过 Manifest、Tokens、CSS 和内置 Effects Profile 实现主题切换与动态视觉效果。

## 必须遵守的架构决策

1. 一个 Skin Engine 插件，多套 data-only skin packages。
2. 皮肤包 v1 不执行任意 JS；效果由引擎内置注册表提供。
3. Manifest、Tokens、Effects Profile 都必须校验。
4. CSS 只在明确作用域内生效，禁止远程资源、`@import` 和危险选择器。
5. Theme Runtime 与 Visual Effects Runtime 分离。
6. CSS / Canvas 2D 为主，WebGL 只做 P2 可选能力。
7. 所有副作用都有幂等 dispose；切换失败必须回滚。
8. 与 Wallpaper Engine 通过 `data-dsh-skin` 兼容标记共存；不修改其他插件私有状态。
9. 未知宿主 Surface 一律 preserve / 原生回退。
10. 性能优先：一个共享 RAF、一个共享 Canvas、页面隐藏暂停、支持 Reduced Motion。

## 第一阶段：先做 M0，不要跳过

- 检查目标仓库的 DSH 版本、插件 manifest、Host / Browser 入口、`webServer`、设置存储和资源服务能力。
- 检查宿主 CSS Variables、data-slot、侧栏 / 顶栏 / 检查器 / 弹窗 / 输入编辑器。
- 检查是否已经有 Skin Manager 或 `data-dsh-skin` 协议。
- 产出 `docs/host-audit.md` 和 `src/adapter/surface-map.ts`。
- 做最小样机：加载一份 CSS、切换一次、完整 dispose，确认回到原生外观。
- 如果宿主 API 不支持 ZIP 上传 / 静态资源路由，不要虚构 API；先实现内置皮肤与最小本地目录方案，并记录限制。

## 实施顺序

严格按 `docs/09-Milestones-and-PR-Plan.md` 和 `docs/10-Codex-Task-Backlog.md` 执行：

- M0：Host Audit。
- M1：Manifest / Registry / Theme Runtime / Skin Lifecycle。
- M2：P0 四项效果。
- M3：Manager UI / Preview / Import Export。
- M4：P1 / P2 效果。
- M5：兼容性、性能、安全与 10 / 100 套皮肤压力测试。

## 8 项 Visual Effects MVP

- P0：Liquid Glass、Aurora、Floating Dust、Light Flow。
- P1：Click Ripple、Starfield、Holographic Glass。
- P2：Liquid Refraction。

效果的具体参数、渲染器、降级和验收见 `docs/04-Visual-Effects-MVP.md` 与 `docs/05-Visual-Effects-Runtime.md`。

## 代码与测试要求

- 使用当前仓库既有语言、构建、测试和 lint 工具，不为一个小功能引入新框架。
- 先写类型和纯函数测试，再写 DOM / Browser 集成测试。
- 新增 Listener、Observer、RAF、Canvas、WebGL、Style / Link 都要在 dispose 中清理。
- 任何 CSS 变更必须验证输入框、编辑器、弹窗、菜单、滚动和层叠。
- 新皮肤必须只通过数据文件接入，不应修改 Engine 源码。
- 保留原生回退路径。

## PR 工作方式

- 每个 PR 保持中等大小，单一目标，附带测试结果和截图。
- 创建 PR 后等待自动 Review / CI；逐条修复评论和失败项，再继续。
- 不把多个里程碑一次塞进一个大 PR。
- 不跳过 Review，不隐藏失败，不在测试未通过时合并。

## 禁止事项

- 不要一开始做在线皮肤商店。
- 不要引入任意 JS / Wasm 皮肤脚本执行。
- 不要把所有效果塞进一个巨大 CSS 文件。
- 不要为每种皮肤创建一个独立 DSH 插件行。
- 不要用大量 MutationObserver 扫描整个 DOM 来猜测 surface。
- 不要默认启动 WebGL。
- 不要把模糊、透明和滤镜应用到整个正文内容树。
- 不要把概念参考图当作宿主真实 DOM 规范。

## 完成标准

交付一个可运行的 Skin Engine v1：可发现、预览、应用、恢复、导入和卸载皮肤；支持 8 项效果（P2 可在 WebGL 不可用时静态降级）；有性能档、安全校验、测试报告、开发文档和至少 3 套示例皮肤。
