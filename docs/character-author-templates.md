# 人物场景作者模板与独立 ZIP

| 作者起点 | 独立样例 | 画面与回退 |
| --- | --- | --- |
| [浅色人物模板](../DSH_Skin_Engine_Development_Pack_v1.0/examples/templates/portrait-light/) | [青笺阅览室](../DSH_Skin_Engine_Development_Pack_v1.0/examples/characters/jade-reading-room/) · `example.jade-reading-room` | 淡青纸面、青玉书库原画和静态右侧构图 |
| [深色人物模板](../DSH_Skin_Engine_Development_Pack_v1.0/examples/templates/portrait-dark/) | [末班车札记](../DSH_Skin_Engine_Development_Pack_v1.0/examples/characters/last-train-study/) · `example.last-train-study` | 葡萄灰车厢、雨夜列车原画与玫瑰窗光。窄窗或减少动效时显示静态原画 |
| [双明暗人物模板](../DSH_Skin_Engine_Development_Pack_v1.0/examples/templates/portrait-dual/) | [晨昏观测](../DSH_Skin_Engine_Development_Pack_v1.0/examples/characters/twilight-shift/) · `example.twilight-shift` | 浅色温室与深色舷窗共用同一皮肤 ID 和偏好，跟随 DSH 外观切换 |

每套模板都含完整的 Manifest、令牌、SceneSpec 和包内原画，可独立复制打包。三种配方把人物锚在右侧，左侧留出对话安全区，并在 760 和 520 CSS 像素断点降低插画尺寸和透明度。浅色和双明暗配方采用静态插画。深色配方沿用轻量视差和环境光，减少动效时保留静态插画。 [场景声明契约](scene-spec.md) · [轻量视差](scene-motion.md)

## 复制自己的皮肤

在仓库根目录使用 Node.js 24。下面复制双明暗模板到一个新目录。

```powershell
npm ci --ignore-scripts
$examples = 'DSH_Skin_Engine_Development_Pack_v1.0/examples'
$copy = '.cache/my-portrait'
New-Item -ItemType Directory -Force .cache | Out-Null
Copy-Item -LiteralPath "$examples/templates/portrait-dual" -Destination $copy -Recurse
```

1. 编辑副本的 `skin.json`，为自己的皮肤设置唯一 `id`、名称、作者和版本。沿用同一 ID 更新已有皮肤时提高版本号。三套模板的 Engine API 最低要求分别为 1.2.0、1.4.0 和 1.3.0。
2. 在 `tokens.json` 修改画布、侧栏和强调色。在 `scene.json` 修改插画、焦点、右侧锚点、安全区和断点。更换图片时更新 Manifest 的 `assets`。为浅色或深色加入实拍预览时，把文件放进 `preview/` 并在 Manifest 对应的明暗字段声明。
3. 双明暗包保持 `colorScheme: "both"`。基础 `colors` 作为浅色配色，`variants.dark` 覆盖深色。SceneSpec 的基础 `asset` 与 `variants.dark` 对应两张插画。 [双明暗契约](dual-appearance.md)
4. 打包副本，并在 DSH「设置 → Skin Engine → Import ZIP」导入输出的 `.dshskin.zip`。选择皮肤后用 Preview 查看当前窗口效果，使用 Cancel preview 恢复，或用 Apply 保存。恢复 Default 和卸载分别在管理器顶部与该皮肤的 Package actions 中操作。

```powershell
npm run pack:skin -- $copy .cache/character-zips
```

## 打包独立样例

三套样例从对应模板复制而来，使用独立 ID 和各自的配色。样例 ZIP 可同时导入。内置皮肤的 `.sample` ZIP 仍是内置风格的打包演示。

```powershell
npm run build
$examples = 'DSH_Skin_Engine_Development_Pack_v1.0/examples'
$output = '.cache/character-zips'
foreach ($skin in 'jade-reading-room','last-train-study','twilight-shift') {
  node scripts/pack-samples.mjs --source "$examples/characters/$skin" $output
  if ($LASTEXITCODE) { throw "Packing failed for $skin" }
}
```

插画的原始字节和来源沿用现有素材清单。样例的预览图取自官方 DSH 的隔离会话。 [发包素材记录](release-asset-notes.md)

1280 × 820 实拍随 ZIP 提供。 [青笺阅览室](../DSH_Skin_Engine_Development_Pack_v1.0/examples/characters/jade-reading-room/preview/light.png) · [末班车札记](../DSH_Skin_Engine_Development_Pack_v1.0/examples/characters/last-train-study/preview/dark.png) · [晨昏观测浅色](../DSH_Skin_Engine_Development_Pack_v1.0/examples/characters/twilight-shift/preview/light.png) · [晨昏观测深色](../DSH_Skin_Engine_Development_Pack_v1.0/examples/characters/twilight-shift/preview/dark.png)

## 复跑真宿主检查

使用 [官方宿主验收命令](acceptance.md#运行)，指定同一份引擎 tarball 并加上 `--suite character-samples --sample-dir .cache/character-zips`。此专项检查三套 ZIP 的导入、预览取消、保存、宽窄窗口、正文与代码及输入区对比度、减少动效、原生外观切换、Default 和卸载。运行目录保留实拍与 `result.json`。
