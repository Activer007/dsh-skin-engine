# V2 Beta 候选的官方宿主验收

候选为 `4f44bc76f349ee61c6d451047fb29064a486de32`。引擎 `1.12.0-beta.1`、Engine API `1.9.0`，两款 V2 ZIP 均为 `0.2.0`。官方 DSH Web 和 Windows Desktop 均使用 `0.2.2-rc.5`、独立配置与相同归档。浮光深境 VI 作为独立回归样例。构建指纹、操作结果、P95 和后台采样见[验收记录](evidence/v2-beta.json)。

## 复跑

先在同一目录保存一个引擎 TGZ、两个 V2 ZIP 和浮光深境 VI ZIP。对两个平台分别运行三组检查。下面的示例使用 PowerShell，路径改为实际的官方宿主与归档位置。

```powershell
$inputs = 'E:/LHA/dsh-skin-engine/.cache/v2-beta/inputs'
$rc5 = 'E:/LHA/dsh-skin-engine/.cache/r3-01/host/rc5'
$common = @('--host-version','0.2.2-rc.5','--archive',"$inputs/dsh-plugin-skin-engine-1.12.0-beta.1.tgz",'--zip-dir',$inputs)
foreach ($platform in 'web','desktop') {
  $hostArgs = if ($platform -eq 'web') {
    @('--web-cli',"$rc5/web/node_modules/@deepseek-ai/dsh/lib/bin.js",'--chrome','C:/Program Files/Google/Chrome/Application/chrome.exe')
  } else { @('--desktop-exe',"$rc5/desktop/DeepSeek Harness.exe") }
  foreach ($check in 'visual','performance','lifecycle') {
    node scripts/acceptance/v2-coexistence.mjs @common @hostArgs --platform $platform --beta-check $check --output ".cache/v2-beta/$check"
    if ($LASTEXITCODE -ne 0) { throw "$platform $check failed" }
  }
}
```

`visual` 检查独立安装、收藏、重启、预览取消和到期、卸载，以及同一对话中的正文、代码和多行输入。`performance` 在同一窗口分别采集 24 次输入、16 次侧栏交互到下一帧的耗时，按同宿主比较；超过 16.7 ms 增量时反序复测。`lifecycle` 从画廊执行 100 次真实应用，检查单场景和各皮肤画布、图层的稳定性，随后进入真实后台 300 秒，恢复后检查继续绘制，最后恢复原生外观并卸载插件。

## 实拍

| Windows Desktop | 新会话三个时刻 | 阅读与窄窗 |
| --- | --- | --- |
| 深海光境 | [开始](images/v2-beta/desktop/deep-ocean-v2-phase-0.webp) · [约 3 秒](images/v2-beta/desktop/deep-ocean-v2-phase-1.webp) · [约 6 秒](images/v2-beta/desktop/deep-ocean-v2-phase-2.webp) | [长会话](images/v2-beta/desktop/deep-ocean-v2-reading.webp) · [760 宽](images/v2-beta/desktop/deep-ocean-v2-760.webp) |
| 流光极幕 | [开始](images/v2-beta/desktop/aurora-v2-phase-0.webp) · [约 3 秒](images/v2-beta/desktop/aurora-v2-phase-1.webp) · [约 6 秒](images/v2-beta/desktop/aurora-v2-phase-2.webp) | [长会话](images/v2-beta/desktop/aurora-v2-reading.webp) · [760 宽](images/v2-beta/desktop/aurora-v2-760.webp) |

[Web 同场景完整截图](images/v2-beta/web)。光场在上部逐渐衰减，底部输入与状态区清晰。极光褶皱在上部随时间舒展，星点固定。长会话实拍包括两轮离线内容、24 段正文、代码块与三行输入。

## 测试环境复盘

Web 首次到期样本约 3.3 秒，一次切换压力测试中配置写入成功但界面等待超时，另一次后台采样中原场景被替换。检查发现多个隔离配置的客户端 JS 实际为同一 pnpm 硬链接。并行安装会改变该文件的 ctime，可触发官方 Web HMR；项目在此前的宿主验收中也记录过这一行为。夹具现要求插件客户端和 Host 入口各自只有一个硬链接，并核对安装后的内容哈希。Desktop 的包管理器若覆盖复制设置，夹具在启动前将已校验的插件文件分离为当前隔离配置的副本。这一调整仅作用于验收环境。

## 输入与侧栏 P95

单位为毫秒，分别列出可信按键与点击后到下一帧的 P95。每一行都来自同一宿主的一次配对采集，Web 和桌面的数值各自对照原生和对应经典版。

| 平台 | 原生 | Deep Ocean | 深海光境 | Aurora | 流光极幕 |
| --- | --- | --- | --- | --- | --- |
| Web，输入 / 侧栏 | 28.8 / 53.4 | 28.5 / 67.5 | 29.5 / 56.1 | 29.9 / 70.4 | 28.1 / 62.6 |
| Windows，输入 / 侧栏 | 8.2 / 17.9 | 18.6 / 17.6 | 17.7 / 17.2 | 17.3 / 17.2 | 16.5 / 18.6 |

本轮两个 V2 的输入或侧栏 P95 增量均低于同平台的 16.7 ms 排查线。数值反映这台机器、当前画质与这组三份产物。
