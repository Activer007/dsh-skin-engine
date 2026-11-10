# DSH Skin Engine 宿主审计

PR-01 · M0 实测记录

目标宿主为官方 `0.2.2-rc.1`。本阶段用同一组合包验证 DSH 的装载、界面、资源与释放。引擎数据包契约和效果实现从 M1 开始。 [开发规划](development-roadmap.md)

## 产物与隔离环境

| 项目 | 版本和来源 |
| --- | --- |
| Web Host | npm `@deepseek-ai/dsh@0.2.2-rc.1`。官方 registry 的 dist integrity 为 `sha512-ijR9UEVYkG15Q/Q79JzvzLBzQOQfc63VLr9n6flpwHPhr5IKn2UxthnSoto/P9l7qGd7pPvI1Ra6TW7LH3oKpg==`。 |
| Windows Desktop | 官方签名的 Windows x64 安装器，文件版本 `0.2.2-rc.1`。SHA-256 为 `830947f8996dc05d991ca9133fff4d3400073e47b9cfa6507754867e79482b23`。用 7-Zip 解出 `app-64.7z` 并在测试目录运行其中的应用。 [官方安装器](https://download.deepseek.com/dsh-desk/bin/win-x64/deepseek-harness-0.2.2-rc.1-win-x64.exe) |
| 官方源码 | Git tag `dsh-v0.2.2-rc.1`，commit `66491b05e3`。 [官方发布](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1) |
| 参考仓库 | Deep Whale `d9bb498`，Wallpaper Engine `e8d832f`。分别验证发布包时另记安装版本和来源。 |

在仓库忽略的 `.cache/pr-01` 下准备独立的 `DSH_HOME`。Web 使用 `skin-engine-web` profile，Desktop 由隔离 home 初始化 `desktop` profile 并指定独立的 `--user-data-dir`。测试启用 `DSH_TELEMETRY_DISABLED=1`，无需模型请求。Browser 插件在当前环境不可用，Web 使用 Playwright 驱动 Chrome，Desktop 使用 Playwright 连接官方应用的本地 CDP 端口。启动日志可能包含仅用于回环认证的启动 URL，测试脚本就地读取，复现记录只保留无凭据地址。

## T0-01 装载与权限

- [组合包清单](../package.json)通过 `dsh.bundle.patch` 插入稳定 ID 的裸包名条目。Host 导出具名 `apply` 与 Cordis 服务 `inject`，Client 产物按包名注册 lazy-CJS factory 并使用宿主 React。包图中的依赖边使用 `dsh.client.inject`，服务依赖在各端入口内声明。 [Client 模块契约](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/client-modules.zh.md)
- [Host 样机](../src/host/index.ts)使用 `ctx.connection.fetch.register` 挂载 owner 专属审计路由。GET/HEAD 检查探测状态，命名 POST 探测持久化和流式请求。流式探测最多接收 8192 字节，读取过程中遵循请求及插件的取消信号。 [Connection 接口](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/connection/src/rpc.ts#L146)
- 只读公开 SVG 按内容 revision 交给 DSH 包资源路由。存储探针用 `ctx.profileContext.name` 派生独立的 `storageDomain` 名称。同一 home 中不同 profile 应读到各自的值。正式包目录与多 Host 写入约束需要单独验证。 [包资源](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/modules/README.zh.md#package-assets) · [领域存储](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/docs/subsystems/storage.zh.md)

## T0-02 令牌与表面

样机以独立来源调用 `theme.overrideTokens`，探测 `--dsw-alias-bg-base` 与 `--dsw-specific-sidebar-fill` 的浅深值。源码候选为 `body` 和 `[data-slot="sidebar"]` 的布局父元素。槽出口为 `display: contents`。表面开放前要记录唯一命中、布局盒子和计算样式，并对照侧栏折叠、编辑器、菜单与弹窗。 [令牌实现](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-theme/src/client/index.ts#L376) · [侧栏布局](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/ui-layout/src/client/AppFrame.tsx#L290)

Windows Desktop 的侧栏槽唯一命中，父元素生成 280 px 宽的布局盒子。浅色时，`body` 背景从 `rgb(255, 255, 255)` 变为 `rgb(232, 243, 252)`，侧栏从 `rgb(249, 250, 251)` 变为 `rgb(215, 233, 248)`。深色时，背景从 `rgb(21, 21, 23)` 变为 `rgb(19, 31, 51)`，侧栏从 `rgb(27, 27, 28)` 变为 `rgb(29, 52, 81)`。撤回后恢复原值和尺寸。当前 [表面映射](../src/adapter/surface-map.ts) 记录令牌载体。Web 从 1280 × 900 收窄到 520 × 780，设置页内容仍在视口内，按钮可获得焦点，侧栏槽保持 `display: contents`。关闭设置后，原生编辑器可获得焦点并接受、清除测试文本。侧栏收起和装饰层几何仍需进一步验证。

## T0-03 样机验证

| 验证 | 证据层级 | 结果 |
| --- | --- | --- |
| `npm run typecheck`、`npm run lint`、`npm test` | 本地构建与隔离夹具 | 通过。四项测试覆盖 100 次 Host 挂载回收、部分注册失败、流式上限与取消、Client factory 及令牌释放。 |
| `npm pack --pack-destination .cache/pr-01 --json` | 实际发布布局 | 通过。产物包含 `cordis.patch.yml`、Host、Client、带摘要的 SVG 与包清单，安装无运行时 npm 依赖。包版本为 `0.0.1-audit.0`，SHA-256 为 `afebb733cd3d1d8a88a2d2fc8743c7fff2690cc2bf4f060beeeaeeea6d5f7e29`。 |
| `0.0.1-audit.1` 冲突保护 | 本地构建、隔离夹具和实际发布布局 | 构建、类型检查、lint 和 4 项测试通过。新增对冲突标记的拒绝、撤回与旧回调隔离断言。tarball SHA-256 为 `b4de36664b66c2b204c542b9db91bd26fd5a2fe38f0360cae41bc93410844fa4`。 |
| `0.0.1-audit.1` 两端复验 | 官方 Web、官方 Windows Desktop | 两端安装同一 tarball。Web 在 Maid Atelier 和壁纸分别占用时拒绝预览，原标记、令牌和壁纸 ID 保持。移除占用后可以预览，再出现外部标记时恢复底色并保留该标记。Desktop 使用其随附 CLI 安装，启动后仍有一个设置入口、图片宽度为 28、读到旧版本保存的值。用 Orca 标记夹具触发撤回，令牌恢复，夹具标记仍在。 |
| Web 安装和 Host 装载 | 官方 CLI 与真实 HTTP | 通过。`dsh plugin --profile skin-engine-web add <tarball>` 安装成功，`--dump-config` 确认唯一裸包名行，回环 Host 提供审计路由。 |
| Desktop 安装和 Host/Client 装载 | 官方签名应用、Playwright CDP | 通过。桌面「插件 → 安装第三方插件」选择同一 tarball，再点击「立即启用」。从设置打开 Skin Engine audit，图片解码为 28 × 28，令牌预览可恢复，`dsh-app://app/` 认证 GET 为 200，流式 POST 返回 5 字节。 |
| Web 设置、停用与重新启用 | 官方 Web、Chrome、Playwright | 通过。设置页加载图片、预览令牌并显示已保存的探测状态。在预览中对隔离 profile 添加引擎行 `disabled: true`，Host 由 200 变为 404，设置入口撤回，页面底色恢复。还原 patch 后在同一页面恢复一个设置入口，Host 回到 200。 |
| Desktop 深色与停用/启用 | 官方签名应用、Playwright CDP | 通过。深色下 100 次预览和恢复，计算样式回到基线。预览中关闭设置也会恢复。桌面插件开关停用后 Host 为 404，再次启用后 Host 为 200，设置入口恢复一项。未重启桌面进程。 |
| Web 认证与请求体 | 真实 HTTP | owner 为 200，未认证为 401，带有效 Cookie 的跨站请求为 403。5 字节 POST 成功，8193 字节为 413。中途断开 chunked POST 后，下一次 GET 成功。Host 端 reader 的取消由夹具直接断言。 |
| 跨 profile 存储 | 真实宿主 | 通过。在同一测试 `DSH_HOME` 中写入 Web probe 后，`skin-engine-web` 读到 true，`desktop` 仍为 false。 |
| 非 owner 与 Web 重启恢复 | 官方 Web Host、真实 Connection 进程内派发 | 通过。重启 `skin-engine-web` 后用临时测试条目调用真实 Connection 的共享 Fetch 派发。owner 为 200，读取到重启前保存的 true，测试用非 owner Peer 为 403。临时条目使用自己的包清单，避免被 Client 模块扫描归入引擎包。 |
| 设置槽的独立撤回与恢复 | 官方 Web、Chrome、Playwright | 通过。令牌预览时将 `ui-settings-general` 单独置为 `disabled: true`。设置面板撤回，底色恢复，样机 Host 仍返回 200。还原 patch 后，同一页面重挂一个设置入口，预览状态已重置。 |
| Desktop 重启与浏览器取消 | 官方签名应用、Playwright CDP | 通过。64 字节 POST 经 `dsh-app://app/` 得到正确计数。用 `AbortController` 中止悬挂的 `ReadableStream` 后，客户端收到 `AbortError`，源流执行 cancel，后续 GET 仍成功。通过 CDP `Browser.close` 退出应用，再以同一隔离 profile 启动，GET 读到保存的 true。 |

### 复现路径

1. 创建 `.cache/pr-01`，运行 `npm ci`、`npm run typecheck`、`npm run lint`、`npm test` 和 `npm pack --pack-destination .cache/pr-01`。记录 tarball 的 SHA-256，确保两端安装的字节一致。
2. 将 `DSH_HOME` 指向独立目录，运行 `dsh --profile skin-engine-web --from-default-profile web --dump-config`，用 `dsh plugin --profile skin-engine-web add <tarball>` 安装，再用 `--dump-config` 核对条目。启动时使用 `--host 127.0.0.1 --port 0 --no-open`。本次使用 Node 24.16.0、pnpm 11.1.2 和官方 npm registry。
3. 从官方安装器的 `app-64.7z` 解出应用。沿用测试 `DSH_HOME`，用独立的 `--user-data-dir` 启动 Desktop，经插件界面安装和启用 tarball。通过「设置 → Skin Engine audit」预览、恢复并检查 Host。
4. Web 通过启动 URL 取得浏览器 Cookie，再访问 `api/dsh-skin-engine/audit`。去掉 Cookie 或添加跨站 Origin 复查拒绝路径。流式 POST 使用 `api/dsh-skin-engine/audit/stream`，持久化探测使用 `api/dsh-skin-engine/audit/persist`。
5. 重启 Web Host 后，从隔离测试条目用 `connection.createPeer` 创建非 owner Peer，并把同一个 GET 请求分别通过 `connection.createSharedFetchHandler('/api')` 派发给浏览器 owner Peer 和测试 Peer。检查状态码和重启前持久化的值。 [官方测试范式](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.1/packages/client/connection/tests/fetch-routes.host.spec.ts#L93)
6. 在预览中向隔离 Web profile 的 patch 添加 `{id: ui-settings-general, disabled: true}`，确认设置槽与令牌撤回、Host 路由仍正常。还原 patch，重新打开设置核对入口和预览状态。Desktop 写入探测值后完全退出并重启，沿用隔离的 home 和 user data。

## T5-01a 参考插件共存

Wallpaper Engine `1.4.2` 和 Deep Whale 的 Maid Atelier `0.1.10` 已从 npm 安装至隔离的 `skin-engine-interop` Web profile。三者在官方 Web 上同时装载，审计 GET 为 200，Maid Atelier 写入 `body[data-dsh-maid-atelier]`，而 `html[data-dsh-skin]` 缺席。此时 Wallpaper Engine 的玻璃门控开启，未配置壁纸。

在同一浏览器中临时写入测试用 `html[data-dsh-skin]`。100 ms 内撤回时玻璃保持。持续标记后约 495 ms 让路，重复写同值保持让路，撤回后约 2654 ms 复位。Maid Atelier 的 body 标记始终存在。这验证的是无壁纸时参考插件对信号的反应。样机仍只管理自己的令牌层，活动壁纸、轮播和跨重启恢复尚待验证。

活动壁纸实验使用独立的 `DSH_WE_DATA_DIR`。通过 Wallpaper Engine 的上传路由加入两张 16 × 16 PNG，配置顺序轮播，并将该插件自带的测试间隔设为 2.5 s。首次自动切换正常。写入并撤回测试标记后，壁纸和 `rotationEnabled: true` 恢复，连续 12 s 未再次切换。参考源码的 `exitSkinYield` 先调用 `applySelection`，此时轮播仍关闭，然后才恢复开关。这个顺序可以解释轮播没有重新排程的现象。官方 npm 的 `latest` 仍指向 `1.4.2`。 [Wallpaper Engine 1.4.2](https://www.npmjs.com/package/dsh-plugin-wallpaper-engine/v/1.4.2) · [恢复顺序](https://github.com/elysia395/dsh-wallpaper-engine/blob/e8d832fc6605af80e2454ccd6dcdfdc4f380822f/src/client.js#L538) · [轮播排程](https://github.com/elysia395/dsh-wallpaper-engine/blob/e8d832fc6605af80e2454ccd6dcdfdc4f380822f/src/client.js#L1238)

在磁盘保留让路状态时重启 Web Host，用新浏览器窗口装载页面。启动复位恢复了原壁纸与轮播开关，并消费让路记忆。以 3.5 s 测试间隔观察约 10 s，轮播仍未发生。关闭轮播后的对照通过。向隔离 profile 临时加入真实 Client Loader 条目，条目用 Cordis effect 发布并拥有 `data-dsh-skin`。撤回条目后标记撤销，原静态壁纸恢复，让路记忆清空，Maid Atelier 的标记始终保留。

对该版本，检测到活动壁纸时保留原壁纸和轮播，暂停可能抢占表面的皮肤激活。旧皮肤或外部让路标记在场时使用同一拒绝策略。预览期间收到冲突标记时撤回当前令牌层，仅释放引擎自己的观察器和令牌。M0 样机以 [Adapter](../src/adapter/coexistence.ts) 实施此保护。仅玻璃场景的让路已经实测通过，可作为后续主动接入的正向用例。活动轮播场景需要在 Wallpaper Engine 能重新排程的版本上重测，才能启用主动让路。

ZIP 导入继续以实际传输、私有资源和完整安全验证作为开放条件。Desktop 已验证字节请求和客户端流取消，独立 Host 观察夹具没有取得可重复的取消传播证据。

## M1 实施基线

| 契约 | 已验证的边界 |
| --- | --- |
| 宿主与发布 | 首个支持版本固定为 `0.2.2-rc.1`。用一个稳定 ID 的裸包名条目装载 Host ESM 和 Client lazy-CJS。Web 与 Windows Desktop 共享同一预构建 tarball。 |
| 令牌与设置 | Client 设置入口使用 `settings.section`，令牌由一次激活持有并可释放。首批只登记已经实测的背景和侧栏令牌。菜单、编辑器、弹窗、顶栏和检查器保留原生。 |
| 资源与隔离 | 随包公开资产走 DSH 包资源路由。引擎业务路由走 owner 专属精确 Fetch 路由，变更用命名 POST。profile 数据分别存储，同一 profile 的多进程写入约束须在提交业务状态前验证。 |
| 共存与回退 | 活动壁纸或旧皮肤在场时保留当前所有者。兼容性矩阵将 Wallpaper Engine 1.4.2 的主动轮播让路标为失败，并记录可验证的保护行为。只有在修复版复测通过后才扩大主动让路范围。 |

样机的装载、可逆清理、owner 资源和冲突保护已经实测。下一项为 PR-02 的内置数据包校验。后续依赖外部 ZIP、私有资源或主动轮播让路的任务各自保留上述验收条件。
