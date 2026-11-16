# DSH 版本支持规则

Skin Engine 自 1.8.1 起声明 `DSH >=0.2.2-rc.1`。1.9.3 的安装声明、可选的 app-boot peer 声明和运行时判断均采用该最低版本。真实宿主结果按版本记录。 [1.9.3 发行与实测范围](release-v1.md#v193-人物皮肤换图)

低于最低版本、版本缺失或格式无效时，运行时返回 `unsupported-host`，提示当前版本及最低要求。每个皮肤包自己的 `dshCompatibility` 和 Engine API 要求继续独立检查。宿主安装器在安装阶段检查 `engines.dsh`。

支持范围与真宿主实测记录分别登记。现有表面与服务以官方 `0.2.2-rc.1` 为审计基线，布局结构与外观所有权的保护仍在运行。未来版本使用相同适配逻辑，后续官方版本发布时按受影响的接口补充专项记录。 [表面审计](host-token-matrix.md)

版本规则覆盖最低 RC、下一 RC、正式版、后续预发布与未来主版本，并核对旧版本、无效版本及皮肤自身的范围限制。

2026-11-11，Node 24.16.0、Windows 11 下的类型检查、Lint 和 59 项测试通过。官方 Web `0.2.2-rc.1` 使用 1.8.1 原始 tarball 通过两次保存切换、预览取消与 Default 恢复。首次启动在 45 秒等待窗口内未取得启动地址，延长启动观察到 90 秒后复测通过，宿主及浏览器均已退出。结果位于 `.cache/dsh-minimum-version/smoke/web-FHrx9G/result.json`，产物由 `f0e6689` 构建。

隔离的官方 `0.2.1-rc.4` 对同一 tarball 按最低版本要求拒绝安装，退出码为 `1`，豁免列表为空。记录位于 `.cache/dsh-minimum-version/legacy-rejection.log`。更高版本的范围判断通过本地契约测试，新增官方版本的实际接口仍需专项验证。

| 官方宿主 | R1 核查结果 |
| --- | --- |
| `0.2.2-rc.1` | 官方表面审计基线。NAV-06 有双端主流程证据，NAV-07 双端通过，1.9.0 已在 Windows Desktop 完成原地安装并核对运行界面。 [官方发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1) · [验收台账](appearance-center-stage1.md) |
| `0.2.2-rc.2` | 发行说明记录 Worktree 审阅、AgentTeam 与桌面更新渠道变化。本轮作为源码对照。 [官方发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.2) |
| `0.2.2-rc.3` | 官方 Web 与 Windows Desktop 的 COMP-01 验收见下方。发行说明记录会话导入及 Windows 更新修复。源码差异还覆盖侧栏入口、More 菜单、布局与主题样式。 [官方发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3) · [官方源码差异](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.2-rc.1...dsh-v0.2.2-rc.3) |

## COMP-01 双端兼容验证

| 验证项 | rc.1 | rc.3 |
| --- | --- | --- |
| 侧栏与主面板 | Web 和 Windows 均能进入外观中心并返回同一聊天。原生取消固定入口在隔离测试中不可用。 | 同样通过。两端均可原生取消固定，通过 More 重新固定。 |
| 聊天预览与系统设置 | 预览条、取消、到期、保存、诊断和应急恢复已通过。 | 主流程通过。快速切换的慢读取在原归档重现，修复后通过预览替换和键盘取消。 |
| 文件与保存 | ZIP 导入、更新、回滚、卸载和原生导出通过，真实 409 后回读，重启恢复。 | 两端通过相同的包操作、409 回读及重启。 |
| Theme Service 与宿主表面 | 画布、侧栏及输入框依据已核对的宿主载体应用。 | Deep Ocean 将画布和侧栏令牌切到 `#0b1220` 与 `#111d2d`，对话输入框实测填充 alpha 为 0.82。 |
| 禁用与实际卸载 | 同一修复归档通过停用迟到读写清理和重启回读。 | 同一修复归档通过停用迟到读写。LF 归档实装后用官方 CLI 卸载，打开的外观中心自动回到原聊天，令牌和输入框恢复原值，效果及入口移除，选中状态 API 返回 404。 |

主流程使用基线 `86a024d31e2c33b72492d959064e34efad9f0e51`，归档 SHA-256 `5fe2dfb5d041bd7f64393f06f37127f4fe4f50c8822e2687a62a75c95954346a`。原生固定、设置和包操作报告分别为 `.cache/r1/rc3/baseline-retry/web-16aXQr/` 和 `.cache/r1/rc3/baseline/desktop-mST8h0/`。保留 Web 初次失败 `.cache/r1/rc3/baseline/web-en2giW/`，慢读取修复及后续证据见 [NAV-06 实测](navigation-release-guide.md#web-快速切换后的读取超时)。

实际卸载使用已审查候选 `ba9ebc65483b52b5744ecb2c1c5e3b3b18a41ae2` 的可复现 LF 归档，SHA-256 `5e98784b57e47217486bb17d849f39c51aeef1e665a391702586bd8e5f0e0663`。沿用隔离宿主命令，传入 `--suite navigation-uninstall --host-version 0.2.2-rc.3 --candidate ba9ebc65483b52b5744ecb2c1c5e3b3b18a41ae2`。报告及卸载前后截图位于 `.cache/r1/comp01-uninstall/web-rm4oYg/` 和 `.cache/r1/comp01-uninstall/desktop-uGiWyL/`。Web 使用随后提交为 `d1d3e3c` 的测试改动，报告头记录当时的基线 `225f43e`；Windows 从 `d1d3e3c` 运行。两端验收无未捕获页面异常，宿主和浏览器均已关闭。

第三方真实共存暂缓并退出本轮发行范围。历史完整 NAV-06 门禁及原始记录保留。

1.9.1 的正式候选在官方 `0.2.2-rc.3` Web 与 Windows Desktop 验证从 1.8.2 原地升级和回装，两个版本均可读取已保存选择、偏好和本地皮肤包。rc.1 保留既有主流程和可靠性证据。 [1.9.1 双端记录](release-v1.md#v191-r1-发行)
