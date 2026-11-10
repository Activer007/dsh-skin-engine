# 官方 DSH 真宿主验收

验收入口为 `scripts/acceptance/run.mjs`。它安装指定的预构建 tarball，核对宿主版本、启用状态以及实际安装的 Host 和 Client 字节，再通过 DSH 界面和本地认证路由操作。每次运行都创建独立的 `DSH_HOME`，Desktop 另建 Electron 用户目录，测试结束后关闭本次启动的进程。

常规变更按影响面选最少的相关用例。已有结果覆盖当前产物和验收条件时，直接引用记录。失败后只复测故障和受影响的路径。多个阶段合入后的大版本等集成里程碑，再集中执行双端发布矩阵与配对性能对照。遇到具体性能问题时用最短的针对性采样定位。

## 准备

- 在仓库根目录运行 `npm ci`，使用 Node.js 24.9 或更新版本。Windows 需可调用 `tar`。
- Web 使用官方 `@deepseek-ai/dsh@0.2.2-rc.1` 的 CLI、PATH 中的 pnpm 和本机 Chrome。可用 `npm install --prefix .cache/acceptance-tools @deepseek-ai/dsh@0.2.2-rc.1` 准备独立 CLI。
- Desktop 使用官方 Windows x64 安装器解出的独立应用目录，包含 `DeepSeek Harness.exe` 和完整的 `resources`。验收会使用该应用随附的 CLI，启动测试进程并在回环地址开启调试。 [官方产物与哈希](host-audit.md)
- 选择待验收的同一份 tarball。v1.0.3 的发布包来自 `3d0e032`。从源码重建该精确版本时，在此提交的独立工作树中运行 `npm ci` 和 `npm pack`。 [包与校验值](release-v1.md#v103-设置面板整理)

## 运行

下面是 Windows PowerShell 示例。将参数换成本机的绝对路径或仓库相对路径。依次运行两端，采样时保持当前测试窗口在前台。

```powershell
$archive = '.cache/pr-14/manager-layout-final/dsh-plugin-skin-engine-1.0.3.tgz'
node scripts/acceptance/run.mjs --platform web --host-version 0.2.2-rc.1 --archive $archive `
  --web-cli '.cache/acceptance-tools/node_modules/@deepseek-ai/dsh/lib/bin.js' `
  --chrome '<local-path>/Google/Chrome/Application/chrome.exe'

node scripts/acceptance/run.mjs --platform desktop --host-version 0.2.2-rc.1 --archive $archive `
  --desktop-exe 'E:/path/to/extracted/DeepSeek Harness.exe'
```

`--suite` 可选 `switch`、`performance`、`lifecycle` 或默认的 `all`，也可用逗号组合。`--switches` 默认 20，`--hidden-seconds` 默认 100。完整发布时可分别传入 100 和 300。每端结果写到 `--output` 下新建的运行目录，默认 `.cache/acceptance/`。查看其中的 `result.json`，包含产物 SHA-256、主机和采样信息、已完成的用例及失败信息。原始 profile 与本地运行产物留在忽略目录中，提交整理后的结果。

单独传入 `--suite appearance` 可运行 [v1.5.0 Web 外观专项](#v150-web-外观专项-next-01)。该套件使用隔离的 Web profile 和无界面 Chrome，在同一 profile 内关闭并重启宿主。

将任一端示例加上 `--suite surfaces`，可专项复跑设置页宽度和输入框适配。夹具写入一份隔离的 v4 会话记录，用新会话与已保存会话核对输入卡片。测试记录两个窗口尺寸的设置页宽度、Deep Ocean 底色、两项系统回退、键盘输入和菜单。浏览器插件不可用时，此流程使用仓库已有的 Playwright 入口，截图保存在相应运行目录。

将任一端命令加上 `--suite artwork`，可复跑 SceneSpec 插画专项。脚本在隔离 profile 中导入使用蓝弧远航原图的静态测试包，核对 1920、1440、1280、760、520 CSS 像素下的对话、焦点和输入区域。记录原生窗口尺寸或受窗口边界限制时的渲染器尺寸，以及缺图、减少透明度、旧插画、预览取消、Default 和停用的结果。截图和关闭状态随 `result.json` 保存。

`--suite scenes --sample-dir <场景 ZIP 目录>` 在每端录制三套场景的九张实拍，并复核导入、预览取消、更新、对比度、减少动效、低质量和 Default。预览采集与 ZIP 复建命令见 [三套场景样例](scene-samples.md)。

`--suite tokens --sample-dir <场景 ZIP 目录>` 在两端的明暗与宽窄窗口记录原生计算样式、候选覆盖及释放后的快照。沿用同一发布包，导入晨光温室场景 ZIP，并核对旧皮肤、原生明暗切换、Default、外部令牌共存和停用。 [语义 Token 矩阵](host-token-matrix.md)

`--suite dual-appearance` 在官方 Web 与 Windows Desktop 核对同包明暗配色和插画、手动切换、跟随系统、保存偏好、重启及 Default。Web 专项还打开同一隔离配置的第二个页面，观察原生设置同步。 [双明暗契约与验收](dual-appearance.md)

`--suite effects-runtime --hidden-seconds 2` 在两端运行同一个旧格式八效果 ZIP，核对静态输出、输入绑定、共享绘制、短后台暂停恢复、GPU 回退和 Default 清理。 [运行时结构与专项](effects-runtime.md)

`--suite scene-motion --sample-zip <夜航员轻量视差 ZIP>` 在两端核对受控视差、环境光、静态回退、外观冲突和 Default，并保存宽窄窗实拍。Desktop 专项另检查原生隐藏与恢复。 [样例与复跑](scene-motion.md)

`--suite catalogue-cache` 在两端记录 10/100 包的冷扫描、热读和缩略图请求，并核对更新、回滚与卸载后的预览失效。 [缓存行为与专项记录](catalogue-cache.md)

用 `npm run pack:samples -- .cache/acceptance-samples` 生成发布样例。将任一端命令加上 `--suite packages --sample-dir .cache/acceptance-samples`，可复跑三套基线 ZIP 往返及 10/100 包目录扫描。脚本通过真实设置页导入、预览及应用，再通过同一登录会话调用导出路由。完整重启宿主后核对已存选择与实际应用的皮肤，再卸载、重新导入导出包并检查 Default 清理。Web 的此项测试使用无界面的 Chrome。目录夹具只放 Manifest 和预览图，记录目录请求耗时、画廊首图解码时间以及滚动前后发出的独立预览请求数。

将任一端命令加上 `--suite static-sample --sample-zip <样例.zip>`，可复跑有画布和侧栏配色、单一明暗模式及真实缩略图的静态样例。脚本核对导入、预览取消、应用、切换明暗、重启恢复、恢复 Default 及卸载。传入 `pack:samples` 生成的 `.sample` 包时，先核对同名内置皮肤的实际配色和缩略图。明暗切换同时核对保存状态、作用域和实际生效的宿主令牌。新旧会话截图保存在结果目录，正文、代码块默认前景和输入文字的对比度根据计算样式中的纯色底层合成取样。Web 使用无界面 Chrome。

暖暮使用 `--suite css-sample --sample-zip <样例.zip>`。除通用流程外，脚本核对 CSS 玻璃和边缘流光、侧栏折展、窄窗、Static、减少动效及减少透明度。Chrome 切换原生标签页或 Electron 最小化，短采样验证边缘流光在后台暂停和恢复。独立样例的两项验收都核对名称、标签、来源筛选和设置页键盘焦点。静态样例还验证强制颜色下的键盘输入。

将任一端命令加上 `--suite package-update`，可复跑同 ID 皮肤包更新。脚本生成两个确定性 ZIP，通过管理器完成导入、保存浮尘偏好、更新、重启、回滚及非活动包更新。它同时核对版本、实际画布色、Canvas 和 Host 保存状态。 [更新与回滚契约](local-package-updates.md)

Desktop 可单独执行原地升级用例。传入 v1.0.0 和带版本标记的 v1.0.4 候选包，脚本在同一隔离 profile 中保存 Deep Ocean 与低质量偏好，退出宿主，替换安装包后重新启动。验收核对 Client、Host、皮肤包、Engine API 四项显示，以及升级前后的保存值。版本不同、旧 Host 缺少版本和 Host 不可达用例通过替换诊断响应复现。

```powershell
node scripts/acceptance/run.mjs --platform desktop --host-version 0.2.2-rc.1 --suite upgrade `
  --desktop-exe 'E:/path/to/extracted/DeepSeek Harness.exe' `
  --from-archive 'E:/path/to/dsh-plugin-skin-engine-1.0.0.tgz' `
  --archive 'E:/path/to/dsh-plugin-skin-engine-1.0.4.tgz'
```

| 用例 | 判定 |
| --- | --- |
| 切换 | 先从 Default 预览、取消，确认 Host 保存值未变。再交替应用 Deep Ocean 和 Aurora，每次核对保存值、修订号及单一场景和 Canvas。恢复 Default 后装饰节点、作用域和效果样式均释放。 |
| 性能 | 两轮交替顺序对比 Default、Deep Ocean 效果 Off 和 Balanced 四项 P0。每个状态采集 180 个空闲帧间隔、24 次可信键入及 16 次侧栏折展，从可信事件记录至下一次 RAF。记录 P95、长任务、画布、装饰节点和空闲绘制速度。每轮相对 Default 连续超过 16.7 ms 的指标列入回归排查，长任务按原始样本另行判断。 |
| 暂停与恢复 | Web 单独启动隔离 Chrome，保留浏览器原生焦点语义，使用标签切换或最小化。Desktop 单独启动测试进程，由 Electron 最小化并隐藏，再还原。隐藏期间按实际经过时间采样，要求零新绘制、Canvas 缓冲归零、极光缓存释放及 CSS 暂停。恢复时核对同一场景和画布、首笔粒子位置、缓存重建及持续绘制。 |

Desktop 性能阶段默认使用正常启动参数。如果隔离窗口虽可见却无法持续提交帧，可用 `--desktop-disable-occlusion` 对整轮关闭 Windows 自动遮挡检测，并单独标记该数据。两个后台夹具均关闭 Windows 自动遮挡检测，依靠显式的原生标签或窗口动作触发 `visibilitychange`。失焦或可见性变化会使本轮无效，结果保留失败状态和已完成的样本，重跑时重新采集配对数据。报告保留重复超线或长任务的证据。

## v1.5.0 Web 外观专项 NEXT-01

2026-11-10 在 Windows 11（`10.0.26200`）、Node.js `24.16.0`、Chrome `157.0.8103.40` 上运行。官方 DSH Web CLI 为 `0.2.2-rc.1`，脚本 Git SHA 为 `a19d835f132dc1edb63756f75f9d97fe528065c3`。使用 PR #17 的 v1.5.0 原包（合并提交 `c94fca6`），SHA-256 为 `0c6ef31ca09e858314ffa4a2c5c86c78bd56acf413c9ca044fe611ec6bef57fc`。Host 和 Client 安装字节均与原包一致。 既有 Desktop 专项 (archived PR #17)

```powershell
node scripts/acceptance/run.mjs --platform web --host-version 0.2.2-rc.1 --suite appearance `
  --archive '.cache/v1.5.0/artifacts/dsh-plugin-skin-engine-1.5.0.tgz' `
  --web-cli '.cache/pr-01/official-cli/node_modules/@deepseek-ai/dsh/lib/bin.js' `
  --chrome '<local-path>/Google/Chrome/Application/chrome.exe' --output '.cache/next-01'
```

PR #17 的超时发生在安装后、浏览器连接前的 URL 等待阶段。旧夹具只在浏览器会话建立后保存宿主日志，历史记录无法进一步区分宿主启动停滞和 URL 公告问题。本轮以同一官方 CLI、原包、原工作目录和启动参数，在新隔离 profile 约 9 秒收到 URL（`.cache/next-01/diagnostic-Bmdl3h/diagnostic.json`）。专项中的两次宿主启动分别在 8694、8566 ms 捕获 URL，均经独立 Chrome 会话返回 HTTP 200。历史超时未复现，根因仍未证实。夹具现会记录浏览器建立前的失败阶段、子进程退出状态和脱敏日志，保留原有启动时限。

| 用例 | 状态 | 结果 |
| --- | --- | --- |
| 双向跨明暗 Apply | PASS | 原生深色 → 曙光航站浅色 → 蓝弧远航深色。通用设置选中项、渲染和 Host 保存一致，revision 从 0 增至 2。跨模式 Preview 禁用并提示，Apply 可用。 |
| Preview / Cancel | PASS | 同模式预览绯雨霓虹，取消后恢复蓝弧远航。预览和取消时保存值及 revision 2 一致。 |
| 保存冲突恢复 | PASS | 在跟随系统且系统解析为深色时，对一次 Apply 注入 409。已观察到浅色临时渲染，失败后恢复跟随系统、深色渲染和 Host 中原来的皮肤与 revision 2。 |
| 完整重启 | PASS | 首个 Host 退出且浏览器断开后启动第二个 Host，保留同一隔离 profile。原生深色、蓝弧远航、revision 2 和插画均恢复。 |
| 恢复 Default | PASS | revision 3 保存为 Default，皮肤属性与引擎装饰节点归零，画布和侧栏恢复原生深色。 |

Web 结果文件为 `.cache/next-01/web-hBAKOA/result.json`。两个 Host 子进程均退出，两个浏览器均断开，进程检查未发现本轮遗留夹具。另在浏览器导航后注入一次中断，确认宿主退出、浏览器断开、尚未执行的用例记录为 BLOCKED。中断记录为 `.cache/next-01/interrupt/web-hW2maK/result.json`。Desktop 的既有结果为 `.cache/v1.5.0/appearance-desktop-UV0tze/result.json`，本轮复用该记录。

## v1.0.3 基线记录

2026-11-10 在 Windows 11 `10.0.26200`、Core i5-13500H、Node `24.16.0` 上运行，Web 与 Desktop 均使用官方 DSH `0.2.2-rc.1`。两端安装的 tarball SHA-256 为 `090c688b78f961603d3d96bb7b740572ce1319a6fc8c6dc333b0947d188438bb`，安装后的两个入口均通过字节校验。各用例的 `result.json` 位于 `.cache/pr-15/` 下对应的运行目录。

| 宿主 | 20 次切换 | 后台 100 秒 |
| --- | --- | --- |
| Web | `web-AH8wKp` 的切换用例完成。预览取消后修订号保持，交替应用 20 次，恢复 Default 后修订号为 21，效果节点归零。 | `web-QALLuG` 通过。Chrome 原生切换标签，6 次采样覆盖 100.018 秒，绘制数保持 5。Canvas 缓冲归零，缓存从 2 降为 0，CSS 暂停。恢复后沿用同一场景和 Canvas，首笔粒子坐标一致，缓存重建为 2。 |
| Windows Desktop | `desktop-FV0fAT` 的切换用例完成，保存和清理结果与 Web 一致。 | `desktop-1WxUTo` 通过。Electron 最小化并隐藏，6 次采样覆盖 100.011 秒，绘制数保持 3。Canvas 缓冲归零，缓存从 2 降为 0，CSS 暂停。恢复后沿用同一场景和 Canvas，首笔粒子坐标一致，缓存重建为 2。 |

性能数据以毫秒记录 P95，顺序为空闲帧间隔、输入事件至下一帧、侧栏折展事件至下一帧。每行末尾为长任务次数。

| 宿主 | 轮次 | 状态 | 帧 / 输入 / 侧栏 P95 | 长任务 |
| --- | --- | --- | --- | ---: |
| Web | 1 | Default | 16.8 / 81.3 / 114.7 | 36 |
| Web | 1 | Deep Ocean 静态 | 16.8 / 94.2 / 31.9 | 10 |
| Web | 1 | Deep Ocean P0 | 16.8 / 37.1 / 38.6 | 0 |
| Web | 2 | Deep Ocean P0 | 16.9 / 26.0 / 33.9 | 0 |
| Web | 2 | Deep Ocean 静态 | 16.8 / 22.2 / 20.4 | 0 |
| Web | 2 | Default | 16.8 / 76.2 / 85.7 | 41 |

Web 对照取自 `web-vdNyE3`，视口为 1280 × 820，DPR 为 2。P0 空闲绘制约 30 FPS，相对 Default 的 P95 差值在两轮中均位于 16.7 ms 排查线以内。Default 与静态之间的长任务和交互延迟波动明显，结论限于本机本次对照。

Windows Desktop 性能对照按本轮指示跳过。`desktop-fYZYjX` 在原生焦点检查处停止，未产生完整的性能样本。此记录只给出 Desktop 的切换与后台结果，Desktop 性能结论待补。

复验产物集中在本地 `.cache/pr-15/artifacts/`，包含原 v1.0.3 tarball、三套 `*.dshskin.zip` 和 `SHA256SUMS.txt`。历史原地升级和 ZIP 往返结果保留在发布记录中。 [版本与发布验收](release-v1.md)

## v1.0.4 宿主表面记录

官方 DSH `0.2.2-rc.1` 两端使用同一份候选包 `dsh-plugin-skin-engine-1.0.4.tgz`，SHA-256 为 `a9daa2c97907019bc5d28fecfe9497fbc0149bc1ee4176b596242e903829d39c`。安装时核对两个入口的字节，使用 `--suite surfaces` 测试。产物位于 `.cache/pr-17/artifacts/`，记录及截图位于 `.cache/pr-17/` 下对应目录。

| 宿主 | 结果目录 | 宽视口及弹窗宽度 | 窄视口及弹窗宽度 |
| --- | --- | --- | --- |
| Web | `web-itUifq` | 1280 px，Skin Engine 1120 px，通用设置 800 px | 760 px，两个设置页均为 760 px |
| Windows Desktop | `desktop-rGvU9X` | 1279 px，Skin Engine 1120 px，通用设置 800 px | 759 px，两个设置页均为 711 px |

两端的新会话和离线记录的已有会话中，输入卡片从原生 `rgb(44, 44, 46)` 切到同色的 `0.82` alpha。减少透明度及强制颜色均回到各端原生计算值。已有会话中验证聚焦、键入、删除，以及命令菜单的打开与 Escape 关闭。移除宿主定位标记和模拟壁纸所有权均触发回退，恢复标记后恢复皮肤。恢复 Default 与在隔离配置停用插件均清理效果场景并恢复输入卡片。两端页面异常为空。截图为 `settings-1280.png`、`settings-760.png`、`composer-hero.png`、`composer-active.png`、`composer-disabled.png`。

Desktop 性能复跑使用相同候选包和 `--suite performance`，记录为 `desktop-Kulbzf/result.json`。窗口前台可见，视口 1279 × 852，DPR 2，Windows 自动遮挡检测保留。两轮均无失焦、可见性变化或长任务，P0 空闲绘制约 30 FPS。

| 轮次 | 状态 | 帧 / 输入 / 侧栏 P95（ms） | 长任务 |
| --- | --- | --- | ---: |
| 1 | Default | 16.9 / 21.4 / 19.0 | 0 |
| 1 | Deep Ocean 静态 | 16.9 / 19.5 / 15.1 | 0 |
| 1 | Deep Ocean P0 | 16.9 / 18.7 / 19.6 | 0 |
| 2 | Deep Ocean P0 | 16.9 / 20.0 / 22.2 | 0 |
| 2 | Deep Ocean 静态 | 17.0 / 18.1 / 13.5 | 0 |
| 2 | Default | 16.9 / 20.9 / 17.0 | 0 |

P0 相对 Default 的最大 P95 增量出现在第二轮侧栏折展，为 5.2 ms，两轮均在 16.7 ms 排查线以内。

## v1.0.4 发布回归记录

继续使用宿主表面记录中的同一份 tarball。将 `3dfadbf` 的源码解到独立目录，将 JSON、TS、TSX、MJS、CSS、SVG、Markdown 和 YAML 的 CRLF 换行统一为 LF，再运行 `npm ci` 和 `npm pack`，已得到同一 SHA-256。三套样例 ZIP 沿用 v1.0.3 的文件名和字节，和 tarball 一同收录在 `.cache/pr-17/artifacts/SHA256SUMS.txt`。原始结果在 `.cache/pr-17/<运行目录>/result.json`。

| 宿主 | 100 次保存切换 | 300 秒后台及恢复 |
| --- | --- | --- |
| Web | `web-M2F5wU`，39.717 秒，恢复 Default 后修订号 101 | 同次运行，原生标签切换，隐藏 300.006 秒，绘制数保持 5 |
| Windows Desktop | `desktop-RRd4c3`，107.231 秒，恢复 Default 后修订号 101 | `desktop-bFF864`，原生最小化并隐藏 300.011 秒，绘制数保持 3 |

每端隐藏阶段都释放 Canvas 缓冲与极光缓存，并暂停 CSS 动画。恢复后使用同一场景和 Canvas，首笔粒子位置一致。`desktop-RRd4c3` 的后续后台用例在计时前报告窗口已隐藏，该部分作废。`desktop-bFF864` 使用关闭设置后重新唤回原生窗口的独立复跑，获得有效证据。

| 宿主 | ZIP 往返记录 | 10 / 100 套本地包目录 |
| --- | --- | --- |
| Web | `web-PVs23K`，三套导入、预览取消、应用、导出、再导入与卸载 | 13 / 103 条，含 3 套内置皮肤。请求耗时 148 / 1032 ms |
| Windows Desktop | `desktop-r7Ron1`，相同三套和步骤 | 13 / 103 条。请求耗时 52 / 284 ms |

每套预览的原始宽度均为 1280 px。导出包保留 ID 和版本，卸载活动样例后恢复 Default。两个目录规模均使用只包含 Manifest 的夹具，返回无目录问题。Desktop 初次运行 `desktop-pSH3mg` 的首张图等待期间原生窗口被标为隐藏，手动唤回隔离窗口后通过。该次请求耗时为 239 / 2234 ms。表中自动复跑使用相同的原生唤回动作和缩略图等待超时。

Web 两轮性能对照见 `web-oYMINd`，视口 1280 × 820，DPR 2，采样期间保持可见和焦点。Desktop 对照使用[同一候选包的宿主表面记录](#v104-宿主表面记录)。

| Web 轮次 | 状态 | 帧 / 输入 / 侧栏 P95（ms） | 长任务 |
| --- | --- | --- | ---: |
| 1 | Default | 16.9 / 15.3 / 14.5 | 0 |
| 1 | Deep Ocean 静态 | 17.0 / 16.1 / 14.5 | 0 |
| 1 | Deep Ocean P0 | 16.9 / 17.0 / 13.8 | 0 |
| 2 | Deep Ocean P0 | 16.9 / 17.2 / 57.7 | 0 |
| 2 | Deep Ocean 静态 | 16.9 / 15.2 / 11.8 | 0 |
| 2 | Default | 17.0 / 15.0 / 13.5 | 0 |

Web 侧栏 P95 增量第一轮为 −0.7 ms，第二轮为 +44.2 ms。第二轮 P0 的 16 个折展样本中，15 个在 13.0 ms 以内，单次为 57.7 ms。两轮没有相同指标持续超过 16.7 ms 的情况，长任务均为零。

结束后按测试可执行文件、profile 和隔离目录检查进程，DSH Web、Desktop 和本次使用的 Chrome 夹具均已退出。

## 纸白样例验收

官方 Web 和 Windows Desktop 使用 `0.2.2-rc.1`。初次在最终 v1.0.4 产物上检查浅 → 深 → 浅切换时，作用域和保存状态会正确切换，计算样式却残留上一次配色。复跑 `web-wcKsm0` 用实际画布与侧栏令牌断言复现。修复将渲染协调延后到宿主主题事件完成后，避免内层令牌更新被外层旧快照覆盖。构建产物测试同时覆盖该事件顺序。

先用未登记内置的修正验证包（SHA-256 `4434ff66f31f26106b376e7227a464561feff42700d995c4e7f561ec4296db06`）和同一份独立 ZIP 实测。Web `web-hUZfdw` 与 Desktop `desktop-0OXoHb` 通过导入、1280 × 820 预览图解码、取消预览、应用、浅 → 深 → 浅、重启恢复、Default 及卸载。浅色恢复后画布为 `#faf8f2`，侧栏为 `#f2ede2`，深色使用原生的 `#151517` 与 `#1b1b1c`。两端正文、代码块默认前景和输入文字对比度分别约为 17.8:1、18.1:1、18.9:1。输入保留键盘焦点和键入，应用期间效果场景为零。

| 产物 | 字节 | SHA-256 |
| --- | ---: | --- |
| 真实 Web 缩略图 `preview/light.png` | 39 119 | `3b502558dcda0a040658aa47f2f8a6763efc0b1e1f435925e7ff0019abf1fa0e` |
| 独立验证 ZIP `com.dsh.skin.paper-light.dshskin.zip` | 40 515 | `c9beb7dcb46736c8ec3e336d7c449faf3fc9ab522ac64082dcec6bd37f4913c5` |
| 配套 ZIP `paper-light.dshskin.zip` | 40 555 | `776f7bd2df7f510a28bb813b13446fe2574ef61f203024b7d90cdd6a1557deb9` |
| `dsh-plugin-skin-engine-1.1.0-rc.1.tgz` | 755 849 | `30f79c1a9ac3d0d460da438c1ef3b1fd44255cfff5030cf05b2b2c0eb36b0411` |

RC tarball 比最终 v1.0.4 增加 35 961 字节，包含纸白数据和缩略图及主题事件顺序修复。旧三套 ZIP 与 v1.0.4 基线逐字节一致。产物位于 `.cache/pr-19/artifacts/`，独立验证 ZIP 位于 `.cache/pr-19/with-preview/`。

再用同一份 RC tarball 和配套 ZIP 在 Web `web-pfCDl3`、Desktop `desktop-UblQ42` 复跑。两端均先核对内置纸白的配色、预览图和 Default 清理，再完成 ZIP 的整条静态样例验收。复跑时将「运行」中的 `--archive` 指向 RC tarball，添加 `--suite static-sample --sample-zip .cache/pr-19/artifacts/paper-light.dshskin.zip --output .cache/pr-19`。截图和结果位于上述运行目录。类型检查、lint 和 37 项测试通过，结束后确认隔离 Desktop、Web Host 和 Chrome 进程已退出。

## 静墨与暖暮样例验收

官方 Web 和 Windows Desktop 均使用 `0.2.2-rc.1` 和同一份 Skin Engine `1.1.0-rc.2` tarball。两端导入同一 ZIP 后核对缩略图解码、中英文名称搜索、标签与来源筛选、预览取消、应用、重启恢复、卸载及 Default 清理。用 [运行命令](#运行) 指向下表产物，分别执行 `--suite static-sample`、`--suite css-sample`，并用 `--sample-zip` 指定对应 ZIP。结果及截图位于 `.cache/pr-21/<运行目录>/`。

| 样例 | Web / Desktop 运行目录 | 正文 / 代码块默认前景 / 输入对比度 |
| --- | --- | --- |
| 静墨 | `web-gmGLiR` / `desktop-wXAsKQ` | 15.63:1 / 16.47:1 / 13.34:1 |
| 暖暮 | `web-dqbZM1` / `desktop-xU5Bt2` | 17.27:1 / 16.47:1 / 13.34:1 |

静墨没有挂载效果场景，强制颜色下仍可键入。暖暮只挂 CSS 玻璃和边缘流光，侧栏折叠时流光隐藏，展开后恢复。两端在 760 / 759 CSS 像素下无横向溢出。Static 和减少动效时动画移除，减少透明度时玻璃隐藏。预跑时深色设置页焦点环约 2.60:1，换用宿主主文本令牌后，两端在 Preview 按钮外侧测得 13.34:1。

| 产物 | 字节 | SHA-256 |
| --- | ---: | --- |
| 静墨预览图 | 37 920 | `e32d62e7ddc6d7b384d0228b0c8117a93a51f6b5c38999a6f8568a6d4891cd6f` |
| 暖暮预览图 | 74 204 | `51dc73462bf6a902c5176ccdcbe2ab4b553085e1437c89ce9cd992b8594407be` |
| `com.dsh.skin.ink-focus.dshskin.zip` | 39 318 | `e6fc2961f89f2aa78d306ef57665c8104845ddc1697859db332ab772949413b3` |
| `com.dsh.skin.warm-dusk.dshskin.zip` | 76 067 | `e8275da1ed2cd3319d8456642a94f4775ceb4cc2cb5bed14785f5183352790fa` |
| `dsh-plugin-skin-engine-1.1.0-rc.2.tgz` | 755 910 | `ae4abba7b192589cacd9404d30f93635f6ba0e1c94870f020fe931fb451b1f1b` |

独立 ZIP 和 RC tarball 位于 `.cache/pr-21/artifacts/`。引擎 tarball 比 RC.1 增加 61 字节，独立 ZIP 的预览素材仅随各自 ZIP 分发。四套内置样例 ZIP 的字节与 RC.1 一致。 [素材来源](release-asset-notes.md)

同一 RC 的 `--suite packages` 在 Web `web-5bhu0A` 与 Desktop `desktop-M7Jda2` 完成旧三套 ZIP 往返及规模验收。目录请求与画廊首图耗时分别计量。100 张缩略图的末张在滚动后才请求并解码。

| 宿主 | 本地包数 | 目录请求 / 首图解码（ms） | 滚动前 / 后请求数 |
| --- | ---: | --- | --- |
| Web | 10 | 47 / 313 | 10 / 10 |
| Web | 100 | 381 / 294 | 36 / 73 |
| Desktop | 10 | 74 / 403 | 10 / 10 |
| Desktop | 100 | 379 / 534 | 36 / 73 |

类型检查、lint 和 41 项测试通过。验收结束后确认本轮隔离 DSH、Web Host 和 Chrome 进程已退出。

## 本地更新与回滚验收

官方 Web 与 Windows Desktop 使用 `0.2.2-rc.1`，装入同一 `1.1.0-rc.3` tarball，SHA-256 为 `279b7801d8216a512435d7d38cbbda3355e1ec70055bc639f8b53372453dd1d4`。候选包位于 `.cache/pr-22/artifacts/`。按 [运行命令](#运行) 指定此 tarball 并加上 `--suite package-update --output .cache/pr-22`。首轮双端记录为 `web-EJXInR` 和 `desktop-Rbnjzg`。

两端从设置页导入 v1.0.0，保存 `low` 与浮尘强度 0.34，更新到 v1.1.0 后画布从 `#182431` 变为 `#312418`，并释放浮尘 Canvas。重启仍渲染 v1.1.0。回滚恢复 v1.0.0、原画布与 Canvas，保存的皮肤和偏好与更新前相同。切到 Deep Ocean 后，更新、卸载非活动包均保留当前 Deep Ocean 渲染。结束后确认测试启动的 DSH、Web Host 和 Chrome 进程已退出。

| 夹具 | 字节 | SHA-256 |
| --- | ---: | --- |
| `test.skin.upload` v1.0.0 | 973 | `3105d005e86f806491fb360ec1c40a3c3030ed0412bbc04a24976fbf8087d19c` |
| `test.skin.upload` v1.1.0 | 882 | `7817d8d05dba21999f47f97a5bb7d92b9ed7a698a57b4084589786893d3dc134` |

类型检查、lint 和 43 项测试通过。Host 夹具核对同修订号并发请求、等价版本及降级拒绝、取消、写入失败、原子替换后响应异常和暂存后子进程退出。未提交的版本在目录中不可见，下一次持锁更新回收遗留目录。 [测试](../test/package-management.test.mjs)

## v1.1.0 发布回归

从 `56d1f51` 的 LF 工作树构建最终 `dsh-plugin-skin-engine-1.1.0.tgz`，SHA-256 为 `5133d984e3f38c4a66757153c868ad5a110f3a6b87a6f6379fbd790a14936fa5`。产物和 SHA 清单位于 `.cache/v1.1.0/final/artifacts/`。发布回归使用官方 DSH `0.2.2-rc.1`，每次核对安装后的 Host 和 Client 字节。使用[运行命令](#运行)，将 `--archive` 指向最终 tarball，结果目录设为 `--output .cache/v1.1.0/final`。

另将 `56d1f51` 用 Git archive 解出到独立源码目录，以相同锁文件重建。引擎和七份 ZIP 的 SHA-256 全部匹配，重建件与复验清单位于 `.cache/v1.1.0/final/rebuilt-artifacts/`。引擎包为 758 913 字节，比 v1.0.4 增加 39 025 字节。三套旧 ZIP 与 v1.0.4 逐字节相同，纸白、静墨、暖暮与对应专项验收的 ZIP 一致。 [重建步骤](release-v1.md#重建发行产物)

预跑使用了 `cd671af` 构建的同版本 tarball，SHA-256 为 `151ea9499eccb2259f686febaa75a0cdec0717d00b12a7495c1256a7316e9c85`。Web `web-WRnYBe` 停绘满 300 秒，首个恢复帧仍使用原场景和粒子位置，回焦刷新目录后则重建场景和 Canvas。修复按包 ID、修订号、来源和数据地址复用已挂载版本，真正换版时重新加载。回归测试分别锁定相同修订号复用和修订号变化后重新挂载。两份 tarball 的文件内容差异仅为 `lib/client.js`。预跑 Desktop `desktop-QYd5HN` 在确认 Web 问题后取消，并通过隔离窗口所属进程核对退出。预跑性能和故障原始证据保留在 `.cache/v1.1.0/`。

### 原生后台暂停与恢复

两端均使用 `--suite lifecycle --hidden-seconds 300`。Web 通过同一 Chrome 窗口切换真实标签页，Desktop 用隔离 Electron 窗口原生最小化并隐藏。两端后台夹具关闭 Windows 自动遮挡检测。六个后台样本均保持绘制计数，Canvas 缓冲为 0 × 0，极光缓存为零，三条 CSS 动画暂停。恢复后仍是原场景和 Canvas，首帧粒子位置一致，极光缓存恢复为两层，并继续绘制。

| 宿主 | 运行目录 | 视口（CSS px） | 隐藏时长 | 隐藏绘制计数 |
| --- | --- | --- | ---: | ---: |
| Web | `web-jMnLGC` | 1037 × 739 | 300.019 秒 | 5 |
| Desktop | `desktop-4StNPK` | 1279 × 852 | 300.006 秒 | 2 |

### 配对性能

用 `--suite performance` 采样。Web `web-Jpodxw` 的视口为 1280 × 820，Desktop `desktop-2DtwpB` 为 1279 × 852，DPR 均为 2。采样期间窗口保持前台可见及焦点，Desktop 使用正常的 Windows 自动遮挡检测。P95 依次为帧间隔、键入到下一帧和侧栏折展到下一帧，单位为毫秒。

| 宿主 · 轮次 | 状态 | 帧 / 输入 / 侧栏 P95（ms） | 长任务 |
| --- | --- | --- | ---: |
| Web · 1 | Default | 16.9 / 14.5 / 14.3 | 0 |
| Web · 1 | Deep Ocean 静态 | 16.9 / 16.3 / 18.1 | 0 |
| Web · 1 | Deep Ocean P0 | 16.9 / 18.2 / 14.7 | 0 |
| Web · 2 | Deep Ocean P0 | 16.9 / 17.3 / 46.4 | 0 |
| Web · 2 | Deep Ocean 静态 | 16.9 / 15.1 / 15.4 | 0 |
| Web · 2 | Default | 16.9 / 14.2 / 16.8 | 0 |
| Desktop · 1 | Default | 16.9 / 17.7 / 18.0 | 0 |
| Desktop · 1 | Deep Ocean 静态 | 16.9 / 18.3 / 15.1 | 0 |
| Desktop · 1 | Deep Ocean P0 | 16.9 / 17.3 / 16.4 | 0 |
| Desktop · 2 | Deep Ocean P0 | 16.9 / 17.0 / 16.9 | 0 |
| Desktop · 2 | Deep Ocean 静态 | 16.9 / 16.9 / 15.1 | 0 |
| Desktop · 2 | Default | 16.9 / 16.2 / 15.0 | 0 |

Web 的两轮 P0 侧栏增量为 +0.4 和 +29.6 ms。第二轮 16 条样本里有一次为 46.4 ms，其余 15 条均在 13.8 ms 以内。此前 v1.0.4 和 v1.1.0 预跑也各记录过一次相同指标的尾延迟。Desktop 的 P0 最大增量为 +1.9 ms。两端均未出现同一指标两轮持续超过 16.7 ms，长任务均为零。Web 偶发侧栏尾延迟留档。

### 保存切换

用 `--suite switch --switches 100`。两端均先确认预览取消不会改变 Host 保存状态，再交替应用 Deep Ocean 与 Aurora 共 100 次。每次核对选择、递增修订号、一个效果场景和一个 Canvas。恢复 Default 后修订号为 101，引擎持有的效果节点及作用域标记清空。Web `web-CpfCvb` 用时 39.547 秒，Desktop `desktop-eLt8hM` 用时 102.061 秒。

### ZIP 往返与目录规模

用 `--suite packages --sample-dir .cache/v1.1.0/final/artifacts`。Web `web-IFL5LA` 与 Desktop `desktop-HXuYar` 的三套旧 ZIP 均通过导入、1280 像素预览解码、预览取消、应用、导出、完整重启、卸载、导出包再导入及 Default 清理。每次重启后核对原保存选择及实际皮肤标记。

| 宿主 | 本地包数 | 目录总条数 | 目录请求 / 首图解码（ms） | 滚动前 / 后预览请求数 |
| --- | ---: | ---: | ---: | --- |
| Web | 10 | 14 | 29 / 285 | 10 / 10 |
| Web | 100 | 104 | 173 / 450 | 36 / 73 |
| Desktop | 10 | 14 | 140 / 955 | 10 / 10 |
| Desktop | 100 | 104 | 979 / 649 | 36 / 73 |

两端 100 包的末张缩略图在滚动后才请求和解码。目录总条数包含 4 个内置皮肤，每个本地夹具的预览为 211 127 字节。

### 宿主表面

用 `--suite surfaces`。Web `web-i663kq` 和 Desktop `desktop-1ta9G8` 的宽窗中，Skin Engine 设置页为 1120 CSS 像素，通用设置为 800。窄窗中分别回到 760 和 711 像素，两种设置页宽度相同。新旧会话的 Deep Ocean 输入卡片使用 0.82 alpha，减少透明度、强制颜色、模拟未知定位和模拟外观所有权冲突时回到原生。两端验证键入与命令菜单，恢复 Default 或停用后恢复原生。截图随运行目录保存。

### 新样例

纸白及静墨用 `--suite static-sample`，暖暮用 `--suite css-sample`。用 `--sample-zip` 指向各自的发行 ZIP。两端均完成导入、1280 × 820 预览解码、预览取消、应用、浅深模式切换、重启恢复、恢复 Default 和卸载。静墨与暖暮均核对中英文名称、标签和来源筛选。

| 样例 | Web | Desktop | 正文 / 代码默认前景 / 输入 / 焦点环 |
| --- | --- | --- | --- |
| 纸白 | `web-uTF0jm` | `desktop-OI7QgW` | 17.79:1 / 18.08:1 / 18.90:1 / 18.90:1 |
| 静墨 | `web-IZsZkt` | `desktop-JGWoZu` | 15.63:1 / 16.47:1 / 13.34:1 / 13.34:1 |
| 暖暮 | `web-M0l93k` | `desktop-5WTSK8` | 17.27:1 / 16.47:1 / 13.34:1 / 13.34:1 |

纸白两端另核对了内置皮肤的预览和实际配色。深色模式保留纸白选择并采用原生外观，切回浅色恢复纸白。两套静态样例都没有效果场景，强制颜色下仍可键入。暖暮只用 CSS 玻璃和边缘流光，在 Web 760 像素与 Desktop 759 像素视口下无横向溢出。侧栏折展恢复流光，Static 或减少动效时停止动画，减少透明度时撤掉玻璃。原生后台短采样分别持续 1006 和 1015 ms，流光时间轴保持不变，回到前台后继续推进。截图随运行目录保存。

### 本地更新、回滚与升级

用 `--suite package-update` 在 Web `web-N4sNWI` 和 Desktop `desktop-h4CDLs` 完成真实管理器操作。活动包从 v1.0.0 更新到 v1.1.0，重启后保留新版画布，回滚恢复旧画布、Canvas、低质量档和 0.34 浮尘强度。两端均验证保存状态和设置控件，更新或卸载非活动包时保持当前 Deep Ocean 渲染。

Desktop `desktop-3f8ZS9` 通过 `--suite upgrade --from-archive .cache/pr-17/artifacts/dsh-plugin-skin-engine-1.0.4.tgz` 从 v1.0.4 原地升到最终 v1.1.0。重启后 Client 与 Host 都显示 v1.1.0，Deep Ocean 皮肤包显示 v1.0.0，Engine API 显示 `^1.0.0`。已选皮肤、低质量偏好和修订号 1 均保留。首轮 `desktop-HzxsKT` 的夹具在旧版收起的自定义区域等待质量控件而超时，调整为先展开再完成复验。

最终构建通过类型检查、lint 和 44 项测试，其中包含普通导入重复 ID 拒绝、同 ID 更新与回滚、并发、取消、写入失败及进程中断恢复，也包含 Starter 的跨换行重建与生产导入测试。19 项正式用例均通过，全部使用同一 tarball。每轮结束按隔离路径和进程身份核对退出，最终确认测试启动的 DSH、Web Host 和 Chrome 均已关闭。
