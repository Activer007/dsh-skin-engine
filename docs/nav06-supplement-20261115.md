# NAV06 真实宿主专项补验：2026-11-15

## 结论与边界

随补丁提供的记录称，官方 Web / Windows Desktop DSH `0.2.2-rc.1` 的指定重复刷新、预览替换、停用后迟到读取/保存响应与复启回读专项通过。原生取消固定入口不可操作；第三方真实共存 blocked。**NAV06 完整验收未完成**，不能据此将总门禁改绿。本轮未发现需修改业务代码的实际缺陷。

## 随补丁提供的证据索引

本次工作区仅收到补丁。下列归档、路径、哈希和观察来自补丁内报告，原始 ZIP 尚未取得，待独立核对。

- 原始包：`nav06-real-host-supplement-20261115.zip`，64 个文件，SHA-256 `a68c4ad446497e8e54bfa5cb3ba81fdaa9fd225a19396ebde8f2123af12d43f4`。
- 解包根目录 `nav06-evidence/`：`SUPPLEMENT-REPORT.txt`、`web-70b7Za/result.json`、`desktop-BXH9cS/result.json`、`coexistence-current.json`、`provenance-and-cleanup.json`；每端 12 张截图。此前四次调试失败结果也保留，不冒充全部尝试一次通过。
- Skin Engine `1.8.2`；运行候选 `dec8573374e359a37494dd5e354d0c248d01bb96`；原验收工具 head `7747b563fe78123ea261d711ddf9146b98bf4425`；主线 `07be9b65e4c902b6056b4d567f15aa13e0f9a413`。
- 复用已验同包 SHA-256 `37e7f26877805209f630343e31382d1f47754940b07f884bdda8d2541ccaddcb`；本机核对候选到主线的运行源码、包配置、构建及 patch 路径无差异，不宣称重新构建了另一包。

## 双端观察

1. 每端首次强制刷新加 3 次重复点击，旧结果未交付前跨导航并返回。允许合法替换请求；没有 POST 写入，revision 保持 0。
2. 暂缓 Night Navigator 实际图片解码结果，加载期间不暴露 Apply；导航取消后请求 Aurora，交付旧结果后仍为 Aurora，只有一个预览条，未保存。
3. 暂缓真实 Host selection 读取结果，停用隔离插件后交付：入口、主面板、预览条和皮肤资源均为 0，输入框可见。
4. 对实际 POST 保存响应重复上述步骤：Host 已提交 Deep Ocean revision 1；停用后的旧响应未重新挂载 UI 或皮肤。复启每端回读 revision 1，只有一个入口，整轮只有一次 selection/apply POST。两端 pageErrors 均为空。

采用隔离 renderer 内真实 `Response.json` / 图片 `decode` Promise 交付 gate 控制时序，未伪造响应体、替换 controller 或修改业务代码。该方法不代表任意网络故障覆盖。可选物理存储指纹探针未找到目标文件，不能把 Web 原始 `storageUnchanged: true` 当成物理文件证明；持久化结论以真实 Host 复启 API 回读为准。

## 未完成项

- 两端真实悬停侧栏并打开原生 More 菜单，仅见 Browse other plugins / Create your plugin；没有取消固定/重新固定入口，记 unavailable，不记 passed。
- 最新 Worktable `0.5.1` 声明 `0.2.0-rc.2 || 0.2.1-rc.3 || 0.2.1-rc.5`；Wallpaper `1.4.2` 声明 `^0.2.0-rc.1`，均不覆盖目标预发布宿主。未安装不兼容插件、未改声明、未用 marker 模拟替代共存。
- 焦点、完整空闲 RAF / 性能基线及最终审查等原有缺项未重跑。其他矩阵按原台账保留，不扩大本次通过范围。

测试进程已退出，既有工作树保持干净，未更改正常用户配置；本轮仅补验，不包含 NAV07。
