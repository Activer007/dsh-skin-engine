# 13 · Visual Reference Index

本包提供 9 张原创矢量参考图：8 张对应 Visual Effects MVP，1 张对应 Skin Manager UI。每张图都有 SVG 源文件与 PNG 预览。

| 文件 | 对应能力 | 开发用途 |
|---|---|---|
| `01-liquid-glass.png` | Liquid Glass · P0 | 玻璃透明度、模糊、染色、边缘高光 |
| `02-aurora.png` | Aurora · P0 | 背景渐变、流动速度、颜色强度 |
| `03-floating-dust.png` | Floating Dust · P0 | 粒子尺寸、密度、景深和漂浮速度 |
| `04-light-flow.png` | Light Flow · P0 | 光带路径、颜色、宽度和速度 |
| `05-click-ripple.png` | Click Ripple · P1 | 点击波纹半径、环数、持续时间 |
| `06-starfield.png` | Starfield · P1 | 星点密度、深度层和闪烁 |
| `07-holographic-glass.png` | Holographic Glass · P1 | 虹彩边缘、光谱和指针影响 |
| `08-liquid-refraction.png` | Liquid Refraction · P2 | 流体扭曲、折射、色散和降级 |
| `09-skin-manager-ui-concept.png` | Manager UI | 画廊、详情、效果参数与性能档布局 |
| `00-visual-effects-mvp-board.png` | 8 项总览 | 评审 MVP 效果的统一视觉方向 |

## 使用规则

- 这些图是视觉目标，不是最终 DOM / CSS 实现截图。
- 不要从图中反推宿主 DOM 结构；Surface Map 必须以 DSH 当前源码和运行时为准。
- 玻璃层不能降低文字可读性；折射效果不能扭曲真实文本。
- P0 先做到与参考图的主要视觉语言一致，不追求像素级复刻。

## AI 概念图

另有 8 张 Runway 生成任务记录，见 `assets/runway-generated/Runway-Generated-References.md`。这些任务为每个 MVP 效果生成了一张 16:9 概念图；任务 ID 可用于 Runway 资产库检索。由于工具返回的是带时效签名的预览链接，本包不将临时 URL 当作长期素材路径。
