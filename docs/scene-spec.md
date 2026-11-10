# SceneSpec v1 声明契约

SceneSpec 是 `dsh.skin/v1` 的可选扩展。声明场景的包须设置 `entry.scene` 为 `scene.json`，在 `capabilities` 中声明 `scene` 和 `assets`，并将 `engineApi` 的最低版本设为 `1.1.0` 或更高，例如 `^1.1.0`。没有场景入口的皮肤可继续使用 Engine API 1.0.0，包括固定版本与窄范围。旧引擎的严格 Manifest 校验会拒绝新入口或能力，版本范围也明确声明了最低要求。

## 文件格式

`scene.json` 使用 UTF-8 JSON，大小上限为 64 KiB。各级对象均拒绝未知字段。以下示例要求 Manifest 的 `assets` 列出 `assets/navigator.webp`，并在 `effects.json` 声明两个对应的内置效果及其渲染能力。

```json
{
  "schema": "dsh.scene/v1",
  "layout": {
    "artwork": {
      "asset": "assets/navigator.webp",
      "fit": "contain",
      "anchor": "right center",
      "focalPoint": [0.86, 0.36],
      "scale": 1,
      "opacity": 0.3
    },
    "safeArea": { "contentLeftFraction": 0.7 },
    "breakpoints": [
      { "maxWidth": 520, "artworkScale": 0.7, "opacity": 0.16 },
      { "maxWidth": 760, "artworkScale": 0.82, "opacity": 0.22 }
    ]
  },
  "presets": {
    "static": [],
    "light": ["ambient.aurora"],
    "dynamic": ["ambient.aurora", "particles.dust"]
  }
}
```

| 字段 | 约束 |
| --- | --- |
| `artwork.asset` | 必填，精确匹配 `assets` 中声明的同包 PNG、JPEG 或 WebP。沿用现有路径、文件类型、尺寸和体积检查。 |
| `artwork.fit` | 必填，`contain` 或 `cover`。 |
| `artwork.anchor` | 必填，横向 `left`、`center`、`right` 与纵向 `top`、`center`、`bottom` 组成的两个词。 |
| `artwork.focalPoint` | 必填，图像内归一化坐标 `[x, y]`，均为 `0–1`，原点在左上角。 |
| `artwork.scale`、`artwork.opacity` | 必填，分别为 `0.5–1.5`、`0–0.35`，边界均包含。 |
| `layout.safeArea` | 可选，`contentLeftFraction` 范围为 `0.5–0.9`。它是为对话预留左侧空间的布局提示，正文对比度仍需实测。 |
| `layout.breakpoints` | 可选，最多 4 条，按 `maxWidth` 严格递增。宽度为 `320–1920` 的整数 CSS 像素。取首个包含当前宽度的规则，仅覆盖基准缩放与透明度。两项覆盖值必填，使用基准字段的相同范围。 |
| `presets.static`、`presets.light`、`presets.dynamic` | 均必填。静态列表为空，轻动效最多 2 个引用，动态最多 8 个。每组内 ID 唯一，且必须指向同包 `effects.json` 中已通过校验的内置效果。 |

`effects.json` 定义效果参数、渲染器和默认启用状态。场景预设只提供候选效果 ID，选择预设本身不会启用一个已关闭的效果。Scene 与 `theme.css` 的旧插画选择器互斥，旧包仍按原规则使用 CSS 插画。外部 URL、跨包路径、SVG、字体、脚本、Shader 和任意样式均不属于此契约。

## 装包与后续渲染

作者打包、ZIP 导入与更新、Host 加载及包含素材的导出使用同一契约。导出时若省略素材，同时省略 `scene.json`、`entry.scene` 和 `scene` 能力，保留原包的 Engine API 范围。包的颜色、效果和保存的偏好仍走现有路径。

插画在已识别的宿主对话背景层绘制，保持原生对话、输入、滚动和焦点布局。断点按窗口 CSS 宽度选取。图片先按对话区域等比 `fit` 和 `scale`，再把 `focalPoint` 对齐到锚点，`left`、`top` 对应 25%，`center` 对应 50%，`right`、`bottom` 对应 75%。声明 `safeArea` 时，左侧指定比例内只保留基色，插画在右侧渐入。在已审计的内容列和输入列范围内，插画最终透明度最高为 `0.16`。

图片缺失、解码失败、宿主布局无法识别、区域过小，或系统启用减少透明度或强制颜色时，插画退回主题基色。旧皮肤的 CSS 插画仍沿用原先的铺放规则。预设的视觉对照、Reduced Motion 降级及发布级双端验收进入 G1 集成阶段。
