# 单包双明暗配色与插画

Skin Engine 1.7.0 的 Engine API 1.3.0 支持一个 `skinId` 对应浅色和深色变体。包仍使用 `dsh.skin/v1`、`dsh.tokens/v1` 和可选的 `dsh.scene/v1`。只要声明任一变体，`skin.json` 就须设置 `"colorScheme": "both"`，并将 `engineApi` 的最低版本设为 `1.3.0`，例如 `^1.3.0`。旧单组包和未声明变体的 `both` 包继续沿用原来的加载与应用规则。

## 配色

以下 `tokens.json` 以浅色作为基准，深色覆盖各自需要改变的颜色。两组都可选，每组沿用原来的语义颜色字段和十六进制色值校验。

```json
{
  "schema": "dsh.tokens/v1",
  "colors": { "canvas": "#f4f3eb", "surface": "#eae8de", "accent": "#376b5e" },
  "variants": {
    "dark": { "canvas": "#0b1220", "surface": "#111d2d", "accent": "#88ccff" }
  }
}
```

各字段从用户保存的颜色偏好、当前明暗变体、包内基础 `colors` 依序取值。管理型旧包的 CSS 声明仍可提供基础回退。字段均缺省时使用宿主或效果默认值。 `canvas` 和 `surface` 如果只在一侧变体中声明，必须在 `tokens.json` 提供该字段的基础值。DSH 要求覆盖值成对提交，这使切换时可以保留原覆盖层的优先级。画布与侧栏是现有审计允许覆盖的两处宿主表面。 `accent` 用于引擎自己的效果。 [宿主 Token 矩阵](host-token-matrix.md)

## 插画

在 `scene.json` 的 `layout.artwork` 中保留必填的基础 `asset`，再用可选的 `variants.light`、`variants.dark` 覆盖对应图片路径。例如 `"asset": "assets/day.webp", "variants": { "dark": "assets/night.webp" }`。基础图与变体图都须列入 Manifest 的 `assets`，并使用同包 PNG、JPEG 或 WebP。图像共用焦点、锚点、安全区和断点。缺少某一侧路径时使用基础图。对应图片无法读取或解码时，保留该模式配色并省略插画。画廊的 `preview.light`、`preview.dark` 可独立设置。 [场景声明契约](scene-spec.md)

## 应用与回退

- 以原生 Theme Service 的有效明暗模式选择变体。手动外观和「跟随系统」均适用。应用或预览 `both` 皮肤沿用宿主当前外观偏好，每个模式共享皮肤 ID、保存版本和自定义偏好。
- 应用前并行解码当前包需要的至多两张图片，共用图片只解码一次。切换时使用已准备的插画，配色由宿主选取对应值。切换不会重新加载包或改写保存选择。应用、预览取消和停用沿用现有取消与释放机制。
- 恢复 Default 释放皮肤的令牌层与插画。若同一皮肤切换时渲染失败，当前窗口回到原生样式，已保存皮肤保留，改变外观或重新应用时可重试。

## 复跑

用 [官方真宿主命令](acceptance.md#运行) 指定同一份引擎 tarball，再加 `--suite dual-appearance`。夹具使用现有晨光温室与夜航员的图生成一个隔离测试 ZIP。结果目录包含 `result.json` 和两张明暗模式截图。

## 双端验收

官方 DSH `0.2.2-rc.1`，Windows `10.0.26200`，Node `24.16.0`，Web Chrome `157.0.8103.40`。两端使用同一份 Skin Engine 1.7.0 tarball，构建提交为 `e3f753419f13852a1afbf15d87b3557e23b01d2c`，SHA-256 为 `af7e079c98e125f775de7c84816fe4c89fd0c1e50a27cfc5997e3bc7692b5335`。隔离样例 ZIP SHA-256 为 `7ad53af7695eb4fee44c7bcdd59d7a54f6a6fa38872e1d266badbf398c8a4080`。

| 平台 | 运行 ID 与夹具提交 | 结果 |
| --- | --- | --- |
| Web | `web-X2PWLJ` · `e3f7534` | 两个页面随同一配置的手动外观变化同步。通过跟随系统、重启、旧版夜航员和 Default。 |
| Windows Desktop | `desktop-6Ml4bB` · `b35c231` | 官方单主窗口通过手动切换、跟随系统、重启、旧版夜航员和 Default。截图夹具在隔离窗口关闭后台渲染节流。 |

手动浅 → 深 → 浅与跟随系统深 → 浅 → 深均通过。系统变化用渲染器的 `prefers-color-scheme` 模拟。两个模式都解码了对应的 1672 × 941 插画，皮肤 ID、修订号和低质量偏好保持。两端浅色正文及输入对比度分别为 16.98:1 和 18.90:1，深色分别为 17.92:1 和 13.34:1，按祖先纯色背景取样。截图与结果归档在本地 `.cache/next-07/`。本轮启动的隔离 DSH 与 Chrome 均已关闭。

类型检查、lint 和 55 项测试通过。Host 契约测试读取全部 13 套内置包，并安装、读取静墨与暖暮两套独立 ZIP。Client 定向用例覆盖解码期间切换外观、缺图保留对应配色，以及渲染失败退回原生样式。
