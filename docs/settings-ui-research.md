# 设置面板宿主研究（UI-R01 / R02 / R03）

Skin Engine 基线为 `main@321158ad41f9a829f9627ec4d99e0f8824a4a82a`，安装 1.8.1 tarball，SHA-256 为 `a66229ddfefaae3f354c64290b0824ab67f9ed74fbd78c30294eae232f6493c1`。复用 NEXT-12 已校验产物，两端安装后核对 Host 和 Client 入口字节。宿主为官方 DSH 0.2.2-rc.1，源代码标签指向 `66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`。声明支持范围仍为 `>=0.2.2-rc.1`。 [版本规则](dsh-compatibility.md) · [NEXT-12 记录](effects-runtime.md#next-12-验收记录)

## UI-R01 · 内容区和当前操作

使用隔离配置，从账号菜单打开「设置 → Skin Engine」，深色外观下从渲染器读取 `innerWidth`、`innerHeight`、弹窗边框盒和插件内容盒宽度。同窗口切到通用设置复核宿主原宽。宽度单位为 CSS 像素。

| 宿主 | 实际视口 | DPR | Skin Engine 弹窗 | 插件内容 | 通用设置弹窗 |
| --- | --- | --- | --- | --- | --- |
| Web | 1280 × 820 | 2 | 1120 | 884 | 800 |
| Web | 760 × 820 | 2 | 760 | 728 | 760 |
| Windows Desktop | 1280 × 820 | 1 | 1120 | 879 | 800 |
| Windows Desktop | 760 × 820 | 1 | 712 | 471 | 712 |

两端四个测点的插件内容区均无横向溢出。760 像素下 Web 已切换为紧凑宿主布局，旧设置页仍显示双栏；Windows Desktop 保留设置导航列，旧详情排在画廊下方。弹窗宽度与既有表面验收一致。 [宿主表面记录](acceptance.md#v104-宿主表面记录) · [宽度适配](../src/adapter/surface-map.ts)

| 入口 | 当前行为与后续修复 |
| --- | --- |
| 画廊搜索、标签和来源 | 只筛选目录。被筛掉的选择会退回到可见已保存项或首项，详情按包 ID 和修订号挂载，可能丢草稿。UI-03 将草稿和编辑目标提升到设置页。 |
| 详情 Preview / Apply | 预览在当前窗口，取消或 30 秒到期后恢复。应用走 Host 修订号与回读。当前头部显示已保存及有差异的显示项，预览文案可能被其他通知替代。UI-03 以同一 Controller 快照分别呈现。 |
| 自定义和窗口效果 | 前者通过 Apply 保存，后者只作用于窗口。环境光已有 Provider，设置仍缺可编辑映射。UI-01 使用已存在的环境光 ZIP 复核。 |
| ZIP 与维护 | 导入在画廊，包操作在详情，维护在底部。UI-07 把操作移到管理页，保留上传进度、取消、确认和 Host 回读。 |

## UI-R02 · Locale、原生控件与键盘

- **Locale 已验证。** 在隔离 profile 安装临时设置 Section，声明 `slots` 和 `locale` 服务，注册 `zh/en` 字典，以 `ctx.locale.bind(namespace)` 提供导航 label，并从 Section 的 `locale` 选项获取 `t`。两端用「通用设置 → 语言」切换中文到 English 再切回，导航标题和面板控件随宿主更新，`html[lang]` 从 `zh-CN` 到 `en` 再到 `zh-CN`。实现时保持 Section id 和组件身份稳定，UI-02 另测活动草稿和预览。 [官方 Locale 实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/locale/src/client/index.ts) · [官方 Section 注册](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-settings-general/src/client/index.ts)
- **原生控件可通过宿主共享模块使用。** npm 上有对应版本，但仅安装该包并尝试把它打进现有 CJS Client 会遇到未解析的运行时依赖及 CSS Modules。将 `@deepseek-ai/dsh-client-ui-primitives` 配成 esbuild external 后，探针 CJS 为 1282 字节，未打入原语实现或样式。它是 DSH 平台基线模块，加载时由宿主解析。官方双端均渲染 36 像素 Button，Space 可切换 Switch，方向键可移动 SegmentedTabs 焦点。 [官方平台模块表](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/web/src/platform.ts)
- **Escape 仍由宿主管理。** 两端从皮肤搜索框按 Tab 到标签筛选，Escape 关闭设置并回焦账号菜单。探针另验证嵌套原生 Modal 首焦点、Escape 仅关闭内层和触发按钮回焦；皮肤管理页先用内嵌确认，保留原设置弹窗的关闭路径。 [宿主设置外壳](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-settings-general/src/client/SettingsRoot.tsx)

## UI-R03 · 实施决定

1. 保留 `settings.section`、宿主弹窗和现有 1120 像素宽度特例。三页共用状态栏。皮肤库以 **840 CSS 像素内容宽度**切换双栏，测得两端常规视口均达到，窄窗均低于该值。双栏详情至少 300 像素。窄布局用原地详情子视图、返回画廊和恢复卡片焦点，由宿主管理外层滚动。
2. 头部显示引擎版本、当前显示、已保存与预览。无预览且显示与保存一致时合并状态。皮肤包版本留在详情。应用单明暗包时保留宿主外观切换，跨明暗预览遵守原限制。预览横幅复用 Controller 的事务和 30 秒到期行为。
3. 以宿主 Locale 的 `zh/en` 字典和稳定注册为首选。对宿主共享控件优先评估 SegmentedTabs、Button、Switch，单项验收后迁移。原生 HTML 控件与 DSH 主题令牌作为可用回退。避免通过共享控件迁移引入额外弹窗。
4. 包管理权限继续以 Host 为准。切换内部页保留进行中的事务和可恢复草稿；关闭宿主设置后按现有生命周期清理。窗口临时效果、按皮肤保存的偏好、实际生效档位分区。

## 复查记录

使用 [隔离夹具](../scripts/acceptance/hosts.mjs) 的 `identify`、`prepareHost`、`installLocalBundle`、`open` 和 [设置导航](../scripts/acceptance/browser.mjs)，沿用官方 CLI、解出的官方 Desktop 和本机 Chrome。Browser plugin not available，使用仓库的 Playwright。探针在临时 Section 中用宿主 Locale 和四个共享控件验证能力；构建只 externalize 官方平台模块，不需要引擎改动。

| 平台 | 结果 | 本机证据目录 |
| --- | --- | --- |
| Web / Chrome 157.0.8103.52 | 通过，页面异常为空，Host 和浏览器退出 | `.cache/ui-settings-research/web-yHl2MC/` |
| Windows Desktop / Chromium 152.0.7977.130 | 通过，页面异常为空，隔离 Desktop 退出 | `.cache/ui-settings-research/desktop-AVaGxo/` |

目录各含 `result.json`、`settings-1280.png`、`settings-760.png`。在原工作区可用 `node .cache/ui-settings-research/research.mjs web` 或 `desktop` 重跑本次探针，使用既有 NEXT-12 tarball 及 PR-01 官方宿主。

在新检出中，可用 [surfaces 用例](acceptance.md#运行) 复查弹窗宽度。在宽窗打开 Skin Engine 后，保持设置打开再调整到 760 像素，读取 `document.querySelector('[data-dsh-skin-engine]').getBoundingClientRect().width`。Locale 探针按上文注册独立 Section，使用 `t('title')` 渲染标题，从通用设置切换两种语言再打开 Section。原生控件探针以 `export { Button, Switch, SegmentedTabs, Modal } from '@deepseek-ai/dsh-client-ui-primitives'` 为入口，使用 `esbuild --bundle --format=cjs --target=es2022 --external:@deepseek-ai/dsh-client-ui-primitives`，将结果放入隔离插件的 Client factory。依次验证 Button Enter、Switch Space、Tabs 方向键、内层 Modal Escape 与设置 Escape。

首轮夹具将 Locale 方法误写为 `t`，窄窗重新开设置也依赖不可见的账号入口。修正为 `bind` 并在窗口变窄时保持设置打开后，完成表中双端复测。界面改版和 UI-09 的集成用例将在对应 PR 验收。
