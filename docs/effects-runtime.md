# 效果运行时的职责与验收

NEXT-08 将窗口状态、场景编排、宿主表面和输入绑定分开。现有八项效果继续使用原来的 ID、参数和默认值，旧 ZIP 走原来的加载入口。

NEXT-12 在此基础上通过 Provider API 1.0.0 注册八项既有效果与环境光示范。场景负责统一分配图层和 Canvas，Provider 处理各自的参数、质量预算和生命周期。 [开发者契约](effect-providers.md)

| 模块 | 职责 |
| --- | --- |
| [窗口运行时](../src/client/effects/p0.ts) | 持有一个共享帧时钟。管理窗口模式、Auto 质量、有效 SceneSpec 预设和活动场景。 |
| [场景编排](../src/client/effects/scene.ts) | 保持图层顺序与 CSS 变量，协调 CSS、Canvas 2D、WebGL 和插画，按可见性与窗口模式挂载、暂停和释放。 |
| [宿主表面](../src/client/effects/surfaces.ts) | 复用已审计的宿主布局，处理 DOM 观察与引擎表面标记的所有权。 |
| [输入绑定](../src/client/effects/interaction.ts) | 在当前对话背景和侧栏绑定被动监听，换表面、暂停或释放时撤销监听并重置交互状态。 |

浮尘、星空和涟漪共用一个 Canvas 2D。虹彩和 WebGL 与 Canvas 2D 共用同一时钟。隐藏时释放 Canvas 像素、极光缓存及 WebGL 资源，恢复从已保留的粒子位置继续。Static 可保留静态 Canvas 快照。Off 释放动效缓冲，Default 撤回引擎图层与标记。GPU 无法分配或上下文丢失时，由现有 CSS 材质接管折射。

## 复跑

使用 [官方真宿主命令](acceptance.md#运行)，增加 `--suite effects-runtime --hidden-seconds 2`。脚本从 Deep Ocean 和 Obsidian Neon 的已发布参数生成一份旧格式 ZIP，用真设置界面导入并应用。专项取样覆盖静态样式、粒子绘制、涟漪与虹彩交互、WebGL 延迟分配与回退、原生窗口隐藏和恢复、Off 及 Default。

专项以 2 秒为最短后台间隔，并记录实际可见性事件或后台读数。300 秒后台和配对性能仍按路线图放在集成关口。

验证 Provider 时再加 `--provider-demo`。同一轮先复跑原八项旧 ZIP，再导入环境光 ZIP，记录单层所有权、预览取消、Static、动态恢复、Default 和截图。Windows Desktop 与 Web 均用原生可见性事件采集最短后台区间。

## 验收记录

官方 DSH `0.2.2-rc.1`，Windows `10.0.26200`，Node `24.16.0`，Web Chrome `157.0.8103.40`。两端候选包从 `37aac6c531975519f67e95d2268385e8bc85e767` 构建，版本 `1.7.0`，SHA-256 为 `90096b89aa46938b9354d218866a239580e3fe0d8460824c10dc74595e26d60f`。同一旧格式夹具 ZIP 的 SHA-256 为 `5c3b86e5da2a03d680aac1ca3840f2985588246cac39b7ea45c90d2442034f9d`。

拆分前的 v1.7.0 基线 tarball SHA-256 为 `af7e079c98e125f775de7c84816fe4c89fd0c1e50a27cfc5997e3bc7692b5335`。Web 基线 `web-ohWEgA` 的静态计算样式、图层顺序、120 次粒子填充、虹彩与涟漪及 GPU 回退均通过。基线后台夹具在确认隐藏前启动计时，后台持续时间未作为通过证据。候选包的图层、CSS 参数和粒子填充与此静态基线一致。

Windows Desktop `desktop-PVG0MQ` 使用夹具提交 `144d195`。实测 GPU 从 831 × 553 转为 CSS，原生窗口恢复后重新分配 WebGL。六次后台读数均保持同一绘制计数，Canvas 像素和极光缓存为零。由于后台读取延迟，末次实际读数约在 117 秒，恢复后的第一帧与暂停前粒子位置相同。Off 和 Default 清理通过。隔离应用已关闭。

Web `web-pMq00v` 使用夹具提交 `7f46973`。最小化 Chrome 原生窗口后，由页面的可见性事件记录约 7.48 秒隐藏，绘制计数保持 4，Canvas 像素和极光缓存为零。恢复沿用原场景、Canvas 和粒子位置。实测 GPU 从 674 × 480 转为 CSS，恢复时重新分配 WebGL。Off 和 Default 清理通过，隔离 Chrome 和 Web Host 已关闭。

双端均在限制 WebGL 后用 CSS 回退，且只尝试一次分配。两端候选包的静态图层及计算样式签名、粒子填充数和 ZIP 字节均与基线一致。原始结果存于本地 `.cache/next-08/` 的 `web-baseline-result.json`、`web-result.json` 和 `desktop-result.json`。

类型检查、lint 和 56 项测试通过。新定向用例验证 WebGL 不可用、上下文丢失及恢复、与粒子共用一个调度句柄和重复释放。效果声明、各渲染器、质量预算与 CSS 样式表在 Git 中逐文件与基线核对。

## NEXT-12 验收记录

Windows `10.0.26200`、Node `24.16.0`，两端使用官方 DSH `0.2.2-rc.1`。Web 使用 Chrome `157.0.8103.40`。Browser plugin not available，使用隔离 Playwright 验收入口。引擎 v1.8.1 候选来自 `d468b864a965c446c158de36ea3b89c6b2ff518f`，两端 tarball SHA-256 均为 `a66229ddfefaae3f354c64290b0824ab67f9ed74fbd78c30294eae232f6493c1`。

| 宿主 | 原生隐藏时间 | 恢复前的 WebGL 尺寸 | 环境光视口 | 证据目录 |
| --- | --- | --- | --- | --- |
| Web | 2140 ms | 674 × 480 | 1037 × 739 | `.cache/next-12/host/web-GO00fI/` |
| Windows Desktop | 2141 ms | 831 × 553 | 1279 × 852 | `.cache/next-12/host/desktop-ZFvG5X/` |

两端均使用与 NEXT-08 字节相同的旧八效果 ZIP。静态图层顺序和计算样式签名与各端 NEXT-08 基线相同，浮尘和星空合计 120 次填充，虹彩与点击涟漪有响应。WebGL 被禁用时只尝试一次分配并使用 CSS。真实上下文丢失时缓冲归零，使用 CSS 回退，恢复窗口时重新分配。在原生隐藏区间内绘制计数不变，Canvas 像素与极光缓存归零，恢复后沿用原场景、Canvas 和粒子位置。Off 和 Default 清理通过。

环境光样例 ZIP 的 SHA-256 为 `000049d4790bbaefb1512fbc7ee397670f31b91c45a1561f01da9d381fbaf3e7`。两端均实测预览取消清理、Apply 后只有一个环境光图层、Static 透明度稳定在 `0.14`、恢复动效沿用同一节点、Default 后无引擎资源残留。每端目录保存 `result.json` 和 `ambient-provider.png`。页面错误为空，隔离 DSH、Web Host 和浏览器均已关闭。

类型检查、lint 和 66 项本地测试通过。Provider 定向测试覆盖严格 Schema 和注册版本、单实例所有权、过期释放、部分挂载失败、帧与绘制异常隔离，以及共享时钟和 GPU 回退。首轮 Web 在虹彩输入处超时，修复侧栏绑定后，两端用同一修复候选重新验证。该轮只运行 2 秒后台专项，长后台和性能对照仍按集成关口执行。

## UI-01 环境光偏好验收

两端使用官方 DSH 0.2.2-rc.1 和同一个 1.8.2 候选包。产物构建自 `9b3adfbb9f3b0b65ec769fc0a2b372fbe55b99f7`，SHA-256 为 `03e6381bcf140eef339ce759d94cb6f8e4b75b42b6e6725a8ea7e8b1d4adacd6`。安装后均核对 Host 和 Client 字节。

| 平台 | CSS 视口 | 插件内容宽 | 结果 |
| --- | --- | --- | --- |
| Web | 1280 × 820 | 884 | 通过，记录位于 `.cache/ui-01/host/web-Mhy4nj/` |
| Windows Desktop | 1280 × 860 | 879 | 通过，含回装与恢复，记录位于 `.cache/ui-01/host/desktop-wMEzQg/` |

旧八效果 ZIP（SHA-256 `5c3b86e5da2a03d680aac1ca3840f2985588246cac39b7ea45c90d2442034f9d`）可安装、应用和保存质量，界面不显示环境光控制。环境光样例默认显示 64%。在 Static 和高质量下预览时，0% 不创建环境光层，50% 和 100% 分别渲染为 0.11 和 0.22。预览和取消保持原保存状态，关闭开关后无光层，再启用并应用时 Host 回读归一化强度 1。两端恢复 Default，页面异常为空，隔离 DSH、Web Host 和浏览器均已退出。

Desktop 保持 1.8.2 写入的记录回装 1.8.1（SHA-256 `a66229ddfefaae3f354c64290b0824ab67f9ed74fbd78c30294eae232f6493c1`），显示原生外观，旧选择服务返回 `503 selection-unavailable`。旧版未改写该记录。关闭隔离宿主，恢复升级前的选择文件后，1.8.1 读回原八效果皮肤和低质量偏好，并可从设置恢复原生外观。回装按 [升级前备份步骤](release-v1.md#回滚) 执行。

类型检查、lint 和 68 项本地测试通过。复跑使用 [验收命令](acceptance.md#运行) 的 `--suite ambient-preferences`，Desktop 加 `--from-archive <1.8.1.tgz>`。记录含 `result.json` 和 `ambient-preferences.png`。Desktop 首轮截图在渲染器被遮挡后超时，修正夹具前台保持后复测通过。Desktop 验收脚本提交为 `ceb473242283242b82fb29eb39a835a04f218c38`，使用同一候选包。完整性能对照留到发布关口。
