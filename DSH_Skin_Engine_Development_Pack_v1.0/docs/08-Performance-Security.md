# 08 · Performance and Security

## 1. 性能原则

- 默认只加载当前皮肤的 CSS 和资源；所有皮肤的元数据可以索引。
- 只使用一个共享 Canvas 2D 层，Dust / Starfield / Ripple 共用调度器。
- WebGL 默认关闭，用户启用 Liquid Refraction 后再创建。
- 玻璃只作用于少量已验证 surface，不做全 DOM backdrop-filter。
- CSS 动画优先使用 `transform` 和 `opacity`；谨慎动画 `filter`、`box-shadow`、背景尺寸和布局属性。
- 隐藏页面暂停 RAF；`prefers-reduced-motion` 关闭环境动画。
- 不在静止状态持续安排 RAF。

## 2. 建议初始预算

| 项目 | Low | Balanced（默认） | High |
|---|---:|---:|---:|
| Dust 粒子 | 24 | 56 | 96 |
| Starfield 星点 | 32 | 72 | 120 |
| Canvas DPR | 1.0 | 1.5 | 2.0 |
| 环境动画 | 15–24 FPS | 30 FPS | 60 FPS 上限 |
| 同时运行的全屏环境层 | 1 | 2 | 2 |
| Glass 模糊 | 0–8px | 8–18px | 18–24px |
| WebGL | 关闭 | 关闭 | 用户主动开启 |

这些是初始目标值，不是跨设备性能保证。M4 必须在指定参考设备上实测并根据结果调整。

## 3. 性能降级

优先级从高到低：

1. 保留主题颜色、布局与可读性。
2. 保留轻量 Liquid Glass 或不透明替代底色。
3. 降低粒子数量和 Canvas DPR。
4. 降低 Aurora / Light Flow 速度与强度。
5. 关闭 Holographic Glass 的指针跟随。
6. 关闭 WebGL Refraction。
7. 完全关闭动态效果，保留静态皮肤。

## 4. 安全边界

皮肤包不是可信代码。即使不执行 JavaScript，CSS 仍可能通过 `url()`、`@import` 或全局选择器影响网络和宿主界面。

v1 校验：

- ZIP 解压防路径穿越；拒绝绝对路径、`..`、符号链接和重复路径。
- 单包解压后建议上限 20 MB；单文件上限 5 MB；Manifest 上限 64 KB。
- `id` 使用严格字符集；文件路径只能位于包根目录内。
- 拒绝 `@import`、远程 URL、`javascript:`、CSS expression、`behavior` 等内容。
- CSS `url()` 只允许包内相对资源路径。
- 禁止 `scripts/`、`.js`、`.mjs`、`.wasm` 作为可执行入口。
- 资源仅允许 PNG / WebP / JPEG / WOFF2 等明确白名单；SVG 需要独立净化后才能允许。
- 未知 Manifest 字段给出警告；未知 capability 拒绝激活。
- 安装采用 staging → validate → atomic rename。
- 任何异常都回退到原生主题。

## 5. 兼容性与安全测试

- 旧 DSH 版本、未知 DSH 版本和不兼容皮肤。
- 恶意 ZIP：路径穿越、超大压缩比、超深目录、重复文件名。
- CSS：全局 `*`、外部 URL、`@import`、危险函数、错误作用域。
- 资源：缺失、损坏、超大、错误 MIME。
- WebGL：不支持、上下文丢失、恢复失败。
- 与 Wallpaper Engine / 第三方主题插件同时运行。
