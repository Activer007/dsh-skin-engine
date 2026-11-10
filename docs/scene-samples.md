# 三套 SceneSpec 场景样例

从 Skin Engine 1.6.0 的「Import ZIP」导入场景包，选择 Apply，再在「Window effects → Scene motion preset」切换三档。晨光温室应用时切换到 DSH 浅色外观，其余两套使用深色。三个独立 ID 均以 `.scene` 结尾，便于与原来的内置皮肤并排比较。

| 场景 | Static | Light motion | Standard motion |
| --- | --- | --- | --- |
| 夜航员 | 靛蓝基色与舷窗原画 | 低强度冷蓝极光 | 极光、柔和光流和轻浮尘 |
| 晨光温室 | 暖象牙基色与水彩原画 | 慢速金色晨光 | 晨光和稀疏空气微粒 |
| 绯雨霓虹 | 低饱和梅红基色与雨夜原画 | 侧栏边缘梅红流光 | 边缘流光和少量霓虹微粒 |

静态档只绘制插画。用户关闭的效果仍保持关闭，系统减少动效时回到静态。三包要求 Engine API `^1.2.0`。插画来源及预览采集说明见 [素材记录](release-asset-notes.md)。

## 复建 ZIP

在仓库根目录使用 Node 24 和锁文件安装依赖，构建一次，再分别调用现有作者打包器。

```powershell
npm ci
npm run build
$source = 'DSH_Skin_Engine_Development_Pack_v1.0/examples/scenes'
$out = '.cache/scene-samples'
foreach ($skin in 'night-navigator','morning-observatory','crimson-rain') {
  node scripts/pack-samples.mjs --source "$source/$skin" $out
  if ($LASTEXITCODE) { throw "Scene packing failed for $skin" }
}
```

每个 ZIP 包含 SceneSpec、效果清单、原画和一个 640 像素宽的 WebP 预览。图像字节按源文件保存，打包器固定条目顺序、换行和时间戳。

## 双端验收

按 [真宿主运行命令](acceptance.md#运行) 指定同一个引擎 tarball，并加上 `--suite scenes --sample-dir .cache/scene-samples`。每端在同一个隔离会话生成九张实拍。`result.json` 记录三档实际效果、正文/代码/输入的对比度、一次静态/标准短采样、低质量、系统降级及关闭状态。缩略图可用 Web `--suite scene-previews` 只抓每套标准动效截图，再缩到宽 640。
