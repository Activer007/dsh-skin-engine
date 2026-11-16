# 夜航员的轻量视差与环境光

「夜航员 · 轻量视差」沿用夜航员的靛蓝舷窗原画、基色、焦点和响应式布局。样例是独立的 `com.dsh.skin.night-navigator.motion` 皮肤包，可与原场景版并排导入。它只展示插画和环境光，方便直接比较原画与轻动效。 [样例源码](../skin-sources/examples/scenes/night-navigator-motion/skin.json)

## 声明和运行方式

在 `dsh.scene/v1` 的 `layout.artwork.motion` 中声明所需效果。需同时提供 `layout.safeArea`、`effects:css` 能力及 Engine API `^1.4.0`。样例配方如下。

```json
{
  "parallax": { "maxX": 8, "maxY": 4, "settleMs": 260 },
  "ambientLight": { "color": "#77aaff", "opacity": 0.22 }
}
```

- `parallax` 可选。横向 0–8 CSS px、纵向 0–4 CSS px，过渡时长为 180–500 ms 的整数。运行时按插画裁切边缘和焦点留白进一步收紧位移。
- `ambientLight` 可选。颜色为十六进制色，透明度为 0–0.24。环境光占用一个插画内的伪元素，受原插画遮罩和透明度限制。
- Standard motion 同时展示视差和冷蓝环境光，Light motion 只保留环境光。Static、Off、Economy、低质量、减少动效、后台和小于 1000 CSS px 的窗口回到原画构图。插画区域宽或高不足 128 CSS px 时也关闭两项增强。宿主表面不可用或被外部外观占用时沿用已有撤回规则。

视差使用窗口共享时钟合并输入，每帧只处理最后一个合格坐标，CSS 完成缓动。键入区域、交互控件、选中文本、触摸与非可信指针事件不触发视差。退出动效时立即取消待绘制任务，移除监听和局部样式。环境光与视差都走已审计的插画区域，共用原有对话安全遮罩。

## 打包与复跑

```powershell
npm run pack:skin -- skin-sources/examples/scenes/night-navigator-motion .cache/scene-motion
```

在 [官方真宿主命令](acceptance.md#运行) 加上 `--suite scene-motion --sample-zip .cache/scene-motion/com.dsh.skin.night-navigator.motion.dshskin.zip`。每端保存宽窗动效、宽窗静态和窄窗静态实拍，记录实际位移、光照、正文和输入对比度、回退及清理。长时和配对性能沿用路线图的集成关口。

## 验收记录

官方 DSH `0.2.2-rc.1`，Windows `10.0.26200`，Node `24.16.0`，Web Chrome `157.0.8103.40`。双端使用从 `58e2417dfde7d72c9ebb0e754a8481237607d681` 构建的 Skin Engine 1.8.0，tarball SHA-256 为 `3a696b6835c4419ba40449d63597d616004d13bc61f970a0180995c4bd075905`，样例 ZIP SHA-256 为 `319a8310944a6369d86639505922fb0f84ee781ac35cae73e7f56d7c8e8e3211`。

类型检查、lint 和 58 项测试通过。新用例覆盖参数越界、缺少安全区、未知目标、合格指针与共享帧合并、关闭时取消绘制及样式清理。

Windows Desktop `desktop-2ieMFD` 的实拍视口为 1280 × 820 及 760 × 820。宽窗插画的计算位移为 `(7.55, -1.71)` CSS px，环境光为 `#77aaff`、透明度 0.22。低档保留同一插画布局。宽窗和窄窗的正文、输入分别为 16.86:1 与 13.34:1。原生隐藏事件内两项增强均撤回，恢复后重新启用。

Web `web-gzfOnU` 使用夹具提交 `a72e135`，待原生侧栏收起后再采集窄窗。相同宽窗中的计算位移为 `(7.55, -2.00)` CSS px，环境光与 Desktop 相同。两端的低质量、Economy、减少动效和 760 像素窄窗均保持插画，位移归零且环境光撤回。键入、外部外观占用及释放、恢复 Default 均通过。两端样例均没有效果 Canvas。隔离进程退出状态、结果与实拍归档在本地 `.cache/next-09/`。
