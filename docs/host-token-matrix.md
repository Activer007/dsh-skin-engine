# DSH 宿主语义 Token 矩阵

适配目标为官方 DSH `0.2.2-rc.1`，源码 tag 对应 `66491b05e3`。矩阵取样使用官方 Web 和 Windows Desktop 的隔离会话，分别切换原生浅色、深色，并在 1280 和 760 CSS 像素宽度核对计算样式。 [宿主与安装来源](host-audit.md#产物与隔离环境)

## 审计方法

按 [真宿主运行命令](acceptance.md#运行) 指定 Skin Engine 1.6.0 tarball，在 Web 和 Desktop 各执行 `--suite tokens --sample-dir <NEXT-05 场景 ZIP 目录>`。样例由 [作者打包入口](scene-samples.md#复建-zip) 生成。脚本在临时 profile 安装一个审计插件，经官方 `theme.overrideTokens` 发布和释放固定探针色。每行记录原生、探针生效、释放后三个快照。结果包含 `getComputedStyle`、实际布局宽度、主题来源、计算值和主题 Presenter 写入的行内值。 [官方主题服务](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-theme/src/client/index.ts#L376)

对比度按计算样式的前景和祖先纯色背景逐层合成，正常文字门槛为 4.5:1。菜单记录绘制层的实际半透明底色。菜单选项的对比度是按祖先纯色估算，菜单材质为同级节点，估算未计入材质和背板模糊。弹窗取通用设置，品牌主按钮取宽窗插件页的「添加插件」。原生设置与输入区均验证键盘焦点。探针覆盖品牌底色时保留按钮前景，检查单独映射的风险。

## 计算样式与回退

以下颜色为 `原生 → 探针`。Web 和 Desktop 各完成四组取样，颜色一致，合并列出。原生由宿主手动选择对应明暗模式。命令菜单材质在深色为 `rgba(48, 49, 54, 0.64)`、浅色为 `rgba(252, 253, 254, 0.7)`。窄窗记录侧栏载体色，侧栏文字、悬停浮层和品牌主按钮只在宽窗取样。

| 宿主 | 模式 | 宽度 | 画布 / 侧栏 | 悬停浮层底色 | 设置底色 | 输入卡底色 | 正文与编辑器前景 | 主按钮底色 |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- |
| 两端 | 深 | 1280 | `#151517 / #1b1b1c` | `#232324 → #382f26` | `#2c2c2e → #202e3e` | `#2c2c2e → #293a34` | `#f9fafb → #f4ddbf` | `#f9fafb → #35435d` |
| 两端 | 深 | 760 | `#151517 / #1b1b1c` | 未取样 | `#2c2c2e → #202e3e` | `#2c2c2e → #293a34` | `#f9fafb → #f4ddbf` | 未取样 |
| 两端 | 浅 | 1280 | `#ffffff / #f9fafb` | `#ffffff → #f1e4d5` | `#ffffff → #e6ecf4` | `#ffffff → #f5ede2` | `#0f1115 → #1a3540` | `#0f1115 → #aac8df` |
| 两端 | 浅 | 760 | `#ffffff / #f9fafb` | 未取样 | `#ffffff → #e6ecf4` | `#ffffff → #f5ede2` | `#0f1115 → #1a3540` | 未取样 |

八组释放后的快照都与对应原生快照一致，包含令牌行内值、颜色、对比度、取样元素尺寸和设置键盘焦点。两端宽窗的通用设置均为 800 CSS px。窄窗通用设置为 Web 760、Desktop 712 CSS px。

两端的正常文字取样结果一致。以下数值为 `原生 → 探针 → 释放`，单位 `:1`。

| 模式 | 侧栏文字 | 正文 | 代码 | 输入 | 设置 | 命令选项估算 | 主按钮 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 深 | 16.47 → 13.07 → 16.47 | 17.45 → 13.84 → 17.45 | 16.47 → 13.07 → 16.47 | 13.34 → 9.11 → 13.34 | 9.18 → 7.28 → 9.18 | 10.38 → 7.19 → 10.38 | **18.08 → 1.90 → 18.08** |
| 浅 | 18.08 → 12.35 → 18.08 | 18.90 → 12.91 → 18.90 | 18.08 → 12.35 → 18.08 | 18.90 → 11.12 → 18.90 | 16.24 → 11.09 → 16.24 | 17.01 → 10.05 → 17.01 | **18.90 → 1.74 → 18.90** |

## 宿主令牌归属

官方主题服务返回的 14 项审查令牌包含 `bg-base`、`bg-layer-1`、`bg-layer-2`、`bg-overlay`、`brand-primary`、两项 `label`、两项 `border`、四项状态和 `sidebar-fill`。主题 Presenter 将覆盖值写到 `body` 行内变量，释放后恢复宿主样式表的值。 [官方主题服务](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-theme/src/client/index.ts#L376) · [主题 Presenter](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-layout/src/client/theme-presenter.ts)

| 表面 | 令牌及实际载体 | 结论 |
| --- | --- | --- |
| 画布、侧栏 | `--dsw-alias-bg-base` 着色 `body`，`--dsw-specific-sidebar-fill` 着色侧栏槽的布局父元素 | 两项继续供皮肤映射。宽窗载体为 280 CSS px。 [侧栏布局](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-layout/src/client/AppFrame.tsx#L290) |
| 提升层与设置 | `--dsw-alias-bg-layer-1` 命中会话轮次悬停浮层，`--dsw-alias-bg-layer-2` 命中设置弹窗。前者也用于原生输入控件，后者也用于其他弹窗 | 全局覆盖会跨越多种原生控件，`surfaceRaised` 暂不加入白名单。 [轮次导航](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-chat/src/client/chat/TurnNavigator.module.css) · [输入控件](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-primitives/src/Input.module.css) · [设置根组件](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-settings-general/src/client/SettingsRoot.module.css#L109) |
| 主按钮 | `--dsw-alias-brand-primary` 经按钮填充别名命中「添加插件」，文字来自独立的 `--dsw-alias-label-primary-foreground` | 单独改底色会使对比度低于门槛，暂不开放。另一个 `--dsw-alias-brand-primary-new-colorprimary-new-color` 原生为浅 `#4176e6`、深 `#5686fe`，没有独立的可开放表面证据。 [原生按钮](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-primitives/src/Button.module.css) |
| 正文、代码与编辑器 | `--dsw-alias-label-primary` 命中正文和编辑器，`--dsw-alias-label-secondary` 由多个原生次级文字共享。输入卡底色是 `--dsw-specific-input-major`，光标是 `--dsw-alias-state-business-primary` | 继续由宿主配对前景、底色和交互状态。探针应用后光标仍为深 `#7aaaff`、浅 `#4176e6`。 [原生会话输入区](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-conversation/src/client/skeleton/InputBar.module.css) |
| 原生命令菜单 | 实际材质读取 `--dsw-menu-surface-fill`。`--dsw-alias-bg-overlay` 的行内值随探针变化，菜单底色保持原值 | `bg-overlay` 不能代表此菜单，菜单保持宿主所有。 [菜单材质](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-primitives/src/MenuSurface.module.css) |

## Adapter 决策

- 生产映射仍由 `canvas → --dsw-alias-bg-base`、`surface → --dsw-specific-sidebar-fill` 两项组成，沿用按来源释放的主题覆盖层。侧栏命中的是实际着色的父布局盒子。 [生产表面映射](../src/adapter/surface-map.ts)
- `surfaceRaised`、全局 Accent 和正文色保持候选状态。`accent` 仍可用于引擎自己的效果，编辑器、原生菜单、弹窗和主按钮保留宿主样式。 [Adapter 白名单](../src/adapter/skin-theme.ts)
- `--dsw-specific-input-major` 是原生输入卡的底色。Deep Ocean 的现有半透明输入卡是已审计选择器上的局部样式。未知宿主由精确版本门控回到 Default。 [宿主兼容检查](../src/core/manifest.ts)

## 皮肤与撤销验收

- 两端应用旧版 Deep Ocean。画布和侧栏变为 `#0b1220` 和 `#111d2d`，输入卡保持现有的 0.82 alpha。正文 17.92:1、输入 14.26:1。主按钮配对和原生光标色保持。通过键盘键入并清除字符。
- 在已保存 Deep Ocean 时从宿主设置切换到浅色。引擎让出外观，保存的 ID 保留，采样恢复为原生浅色快照。之后导入并应用晨光温室场景，画布和侧栏为 `#f4f3eb` 和 `#eae8de`，正文 16.98:1、输入 18.90:1。再次键入后恢复 Default，采样与原生浅色一致。
- 独立来源先覆盖深色画布 `#20262d` 和设置层 `#303744`，再模拟 Wallpaper 所有权冲突。引擎撤销自身作用域，保留外部颜色、外部标记和已保存皮肤，正文和输入均达到 4.5:1，键盘输入可用。清除外部标记后重新应用已选皮肤。停用引擎同样释放自身样式，保留外部两项颜色，释放外部来源后画布回到原生 `#151517`。

## 执行记录

Windows `10.0.26200`、Intel Core i5-13500H、Node `24.16.0`、Web Chrome `157.0.8103.40`。Desktop 使用官方 `0.2.2-rc.1`、DPR 1 和隔离窗口。脚本提交为 `620fe2db7793ecde97a9b67b47c4a4e9701e9273`。双端验证安装的 Host 和 Client 字节，Skin Engine 1.6.0 tarball SHA-256 为 `9b4d8c8bce81caba82fb2212f5d023fd47b29fa90741760d7e31858122c91ab2`，晨光温室 ZIP SHA-256 为 `51b77eb3eaca0c287eac9f465e0e0a481d2c3d78bf04325d301eaefaa02784ff`。

| 平台 | 运行 ID | 本地原始记录 | 结果 |
| --- | --- | --- | --- |
| 官方 Web | `web-BX0eZX` | `.cache/next-06/web-result.json` | 四组矩阵及皮肤、撤销专项通过。Chrome 与隔离 Host 已关闭。 |
| 官方 Windows Desktop | `desktop-IbUlO8` | `.cache/next-06/desktop-result.json` | 四组矩阵及皮肤、撤销专项通过。隔离应用已退出。 |

类型检查、lint 和 53 项现有测试通过。测试同时锁定 Adapter 两项映射以及未知宿主回退。专项只采集表面与撤销，性能和长时样本按路线图在集成里程碑执行。
