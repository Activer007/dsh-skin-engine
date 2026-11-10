# 12 · Research and References

研究日期：2026-11-09。以下结论基于公开仓库 main 分支的 README、目录、关键代码、ADR 与测试文件；不是对所有历史版本的保证。

## 1. dsh-deep-whale

仓库：<https://github.com/Small-tailqwq/dsh-deep-whale>

### 值得借鉴

- `skin.json` 作为皮肤元数据入口，包含 ID、名称、标签、包名、预览图和 DSH 兼容信息。
- Skin Manager 能从当前 profile 依赖中发现带有效 `skin.json` 的皮肤。
- 同一时间只允许一套皮肤启用；启动时对多套同时启用做兜底处理。
- `protocol.ts` 定义版本化自定义配置事件（v1 / v2），有 register / unregister / ready 握手。
- 每套皮肤通过 `apply(state | null)` 接收配置，皮肤自己负责 DOM / CSS / observer / listener 的副作用和清理。
- `PreferencesStore` 按 skinId 保存设置，进行值归一化、跨标签同步和版本化导入导出。
- Compatibility 模块镜像 DSH 插件 peer range 检查，并把明确的版本放行交给 Host 自己的接口。

### 不直接照搬

- 当前仓库的每套皮肤是独立 DSH 插件包。我们希望一个 Skin Engine 管理数据型皮肤包，不希望 100 套皮肤变成 100 个插件入口。
- 管理器涉及 profile / home patch 的启停写入、依赖发现和插件图重组；v1 只在确实需要时使用宿主配置接口，不复制整套复杂的 patch 管理。
- 皮肤包自有 DOM / CSS 仍需要作者维护；我们进一步把常见动画能力收敛到引擎内置效果注册表。

关键文件：

- <https://github.com/Small-tailqwq/dsh-deep-whale/blob/main/skin-manager/README.md>
- <https://github.com/Small-tailqwq/dsh-deep-whale/blob/main/skin-manager/src/contract.ts>
- <https://github.com/Small-tailqwq/dsh-deep-whale/blob/main/skin-manager/src/protocol.ts>
- <https://github.com/Small-tailqwq/dsh-deep-whale/blob/main/skin-manager/src/client/runtime.ts>
- <https://github.com/Small-tailqwq/dsh-deep-whale/blob/main/skin-manager/src/client/preferences.ts>
- <https://github.com/Small-tailqwq/dsh-deep-whale/blob/main/maid-atelier/skin.json>
- <https://github.com/Small-tailqwq/dsh-deep-whale/blob/main/orca-link/skin.json>

### 美术授权注意

该仓库 README 声明自有代码采用 MIT，但皮肤美术资源采用 CC BY-NC-SA 4.0，禁止商业性使用。我们没有复制其中角色图、壁纸或皮肤截图；只引用其公开架构与文档。

## 2. dsh-wallpaper-engine

仓库：<https://github.com/elysia395/dsh-wallpaper-engine>

### 值得借鉴

- `packages/glass` 将 Glass 功能拆成独立子包；主包与 Glass 通过 host service / layer hooks 协作。
- `glass.js` 集中解析各玻璃表面的参数与 CSS Variables。
- `glass-surfaces.js` 负责表面策略、几何安全和可撤销装饰层。
- `sync / dispose` 成对管理运行时状态。
- ADR-0015 强调先判断 Surface 所有权、装饰不改变共享层叠结构、无法证明安全就回退原生。
- `data-dsh-skin` 让路标记可用于跨插件共存；Wallpaper Engine 在其他皮肤接管时让路。
- ADR-0011 将预设升级为完整配置快照，提醒我们要区分皮肤包与用户配置。

### 不直接照搬

- Glass Surface Manager 的几何检测、Observer 和兼容逻辑较复杂；普通 CSS 主题不需要全部引入。
- 不要把皮肤效果直接放到宿主每一个 DOM 元素上；先做少量已验证 Surface。
- Wallpaper Engine 的壁纸扫描、媒体桥接、视频播放和 3D 背景不属于 Skin Engine v1 范围。

关键文件：

- <https://github.com/elysia395/dsh-wallpaper-engine/blob/main/docs/adr/0015-glass-surface-ownership.md>
- <https://github.com/elysia395/dsh-wallpaper-engine/blob/main/docs/adr/0016-glass-subpackage.md>
- <https://github.com/elysia395/dsh-wallpaper-engine/blob/main/docs/adr/0011-preset-full-snapshot.md>
- <https://github.com/elysia395/dsh-wallpaper-engine/blob/main/packages/glass/src/glass.js>
- <https://github.com/elysia395/dsh-wallpaper-engine/blob/main/packages/glass/src/glass-surfaces.js>
- <https://github.com/elysia395/dsh-wallpaper-engine/blob/main/packages/glass/src/glass-layer.js>

## 3. 技术资料

- MDN `backdrop-filter`：<https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter>
  - Baseline 2024，但旧浏览器与复杂 backdrop-root 边界仍需测试。
- MDN CSS 性能：<https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/CSS>
  - 优先减少不必要动画，优先 transform / opacity，避免高频触发布局。
- MDN Page Visibility API：<https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API>
  - 页面隐藏时暂停不必要的工作。
- MDN requestAnimationFrame：<https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame>
  - 使用时间戳推进动画，避免刷新率不同导致速度不同。
- MDN Animation Performance：<https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Animation_performance_and_frame_rate>
  - CSS / Canvas / WebGL 都可能产生性能成本，应以帧耗时验证。

## 4. 设计结论

我们采用：

- dsh-deep-whale 的 Manifest / Registry / Compatibility / Preferences / versioned protocol 思想；
- dsh-wallpaper-engine 的 Glass 分层、Surface Ownership、sync/dispose、`data-dsh-skin` 共存协议；
- 新增轻量 Visual Effects Runtime，以 CSS / Canvas 2D 为主，WebGL 为可选高级渲染器。

我们不复制任何一个仓库的完整实现，也不把它们的所有模块搬进新引擎。
