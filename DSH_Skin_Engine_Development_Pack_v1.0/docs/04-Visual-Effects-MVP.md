# 04 · Visual Effects MVP

> 8 项效果必须进入 v1 规划。P0 是首个可运行演示版本，P1 是下一轮交互增强，P2 是高级图形能力。

## 1. 优先级总览

| # | 效果 | 优先级 | 主渲染器 | 首版交付 |
|---:|---|---|---|---|
| 01 | Liquid Glass | P0 | CSS | 磨砂、透明、染色、边缘高光 |
| 02 | Aurora | P0 | CSS | 多层极光渐变缓慢漂移 |
| 03 | Floating Dust | P0 | Canvas 2D | 稀疏漂浮尘埃与景深 |
| 04 | Light Flow | P0 | CSS | 细光带沿背景或面板边缘流动 |
| 05 | Click Ripple | P1 | Canvas 2D | 点击扩散波纹 |
| 06 | Starfield | P1 | Canvas 2D | 星空与轻微视差 |
| 07 | Holographic Glass | P1 | CSS | 虹彩边缘与角度高光 |
| 08 | Liquid Refraction | P2 | WebGL | 程序化折射与流体光学效果 |

## 2. 01 · Liquid Glass（P0）

**目标观感**：界面面板像真实半透明玻璃，能看到后方环境色；有柔和磨砂、边缘高光、轻微色彩偏移和层次感。

实现：
- `backdrop-filter: blur(...) saturate(...)`，必要时提供 `-webkit-backdrop-filter`。
- 背景填充使用半透明主题色，不对整个面板内容设置低 `opacity`。
- `::before` / `::after` 绘制边缘高光、内侧亮线和微弱反射。
- 玻璃只应用到 Adapter 已声明的表面；避免对大面积、深层嵌套容器重复模糊。

参数：`blur` 0–24px；`tintAlpha` 0.08–0.30；`saturation` 1.0–1.5；`edgeLight` 0–1；`frost` 0–1。

验收：文字对比度达标；弹窗、菜单不被玻璃层遮挡；不支持 `backdrop-filter` 时使用不透明或近不透明底色回退；dispose 后无残留。

## 3. 02 · Aurora（P0）

**目标观感**：背景出现柔和的青、蓝、紫色极光带，缓慢变化，不干扰正文。

实现：2–3 个伪元素 / 背景层；使用渐变、模糊和 `transform` / `opacity` 动画。优先动画合成友好属性，避免高频改变背景尺寸或布局属性。

参数：`speed` 0.1–1.0；`intensity` 0–1；`palette`；`blur`；`direction`。

验收：无明显色带断层；文字可读；关闭动态效果时变为静态渐变；页面隐藏时停止动画。

## 4. 03 · Floating Dust（P0）

**目标观感**：少量细小光尘在背景中漂浮，形成空间深度。

实现：一个全局共享 Canvas 2D 层；粒子以对象数组存储；使用单个 `requestAnimationFrame` 调度；不同粒子使用不同速度、半径和透明度模拟景深。

建议初始粒子数：低 24、平衡 56、高 96。粒子密度参数归一化为 0–1，再由 Quality Manager 转换为实际数量。

参数：`density` 0–1；`speed` 0.1–1.0；`sizeRange`；`opacity`；`drift`。

验收：粒子不捕获鼠标事件；不创建逐粒子 DOM；停止效果后 Canvas 与 RAF 完全释放。

## 5. 04 · Light Flow（P0）

**目标观感**：少量细光线沿背景、玻璃边缘或指定路径缓慢流动。

实现：CSS 渐变条 / SVG 路径作为独立装饰层；使用 `transform` 和 `opacity` 控制移动与呼吸。v1 不做复杂路径编辑器。

参数：`speed`；`intensity`；`width`；`colorStops`；`route`（内置预设）。

验收：最多两条主要光流；不覆盖正文；低性能模式可自动关闭。

## 6. 05 · Click Ripple（P1）

**目标观感**：用户点击后出现短暂扩散的透明波纹，反馈清晰但不夸张。

实现：复用 Particle Canvas 或共享 Interaction Canvas；最多同时存在 4 个 ripple；`pointer-events: none`；不拦截表单、拖拽和快捷键。

参数：`durationMs` 300–800；`maxRadius` 80–220px；`ringCount` 1–3；`color`。

验收：快速连续点击时有上限；窗口隐藏后清空过期 ripple；`prefers-reduced-motion` 下关闭或缩短为静态反馈。

## 7. 06 · Starfield（P1）

**目标观感**：深色皮肤中出现稀疏星点、少量亮星和非常轻的视差。

实现：复用 Canvas 2D 粒子引擎，不单独创建第二套持续 RAF。与 Dust 共用粒子模型，通过 `kind` 区分星点和尘埃。

参数：`starCount`；`twinkle`；`parallax`；`depthLayers`；`brightness`。

验收：星点不会像噪点一样铺满屏幕；滚动时不造成明显闪烁；低质量档减少星数并关闭视差。

## 8. 07 · Holographic Glass（P1）

**目标观感**：玻璃边缘出现克制的虹彩、光谱干涉和随指针位置变化的高光。

实现：CSS 多层渐变、mask / border-image 或伪元素；Pointer Events 只更新当前玻璃 surface 的局部变量。不要把 `mix-blend-mode`、`filter`、`will-change` 无限制应用到所有祖先。

参数：`iridescence`；`edgeWidth`；`pointerInfluence`；`spectrum`；`intensity`。

验收：彩虹效果只出现在边缘和反射区；不会影响正文颜色；没有指针时仍有静态精致质感。

## 9. 08 · Liquid Refraction（P2）

**目标观感**：流体形状、光学焦散和折射产生液态玻璃质感。

实现：WebGL fragment shader 在独立背景纹理 / 程序化纹理上执行折射、扭曲与色散；不尝试直接扭曲浏览器实时 DOM 文本。浏览器不支持 WebGL 或资源创建失败时，回退到 CSS 液态渐变和高光。

参数：`distortion`；`dispersion`；`flowSpeed`；`refractionScale`；`quality`。

验收：WebGL 是可选增强；不影响正文像素；上下文丢失可恢复；默认关闭，用户主动启用后才创建上下文。

## 10. P0 Demo 组合

首个效果样板建议使用 Deep Ocean 皮肤：

- Liquid Glass：左侧栏、顶部区域、右侧设置面板。
- Aurora：全屏背景，强度 0.35–0.55。
- Floating Dust：平衡档约 56 粒子。
- Light Flow：一条主光流、一条弱边缘流。

演示必须同时展示静态、动态、低性能和关闭动态效果四种状态。
