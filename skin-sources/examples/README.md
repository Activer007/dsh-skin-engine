# 示例皮肤与作者模板

| 类别 | 源码 | 打包入口 |
| --- | --- | --- |
| 内置皮肤及对应 ZIP 样例 | [Deep Ocean](skins/deep-ocean/)、[Aurora](skins/aurora/)、[Obsidian Neon](skins/obsidian-neon/)、[纸白](skins/paper-light/)、[雾松](skins/mist-pine/)、[夜航员](skins/night-navigator/) | `npm run pack:samples -- <输出目录>` |
| 内置人物系列及对应 ZIP 样例 | [青玉书库](skins/jade-archive/) | `npm run pack:samples -- <输出目录>` |
| 内置人物续集及对应 ZIP 样例 | [蓝弧远航](skins/blue-arc/)、[曙光航站](skins/dawn-station/)、[月窗余晖](skins/moonlit-horizon/)、[绯雨霓虹](skins/crimson-rain/) | `npm run pack:samples -- <输出目录>` |
| 独立 ZIP 样例 | [`skins/ink-focus`](skins/ink-focus/)、[`skins/warm-dusk`](skins/warm-dusk/) | `npm run pack:skin -- <源码目录> <输出目录>` |
| 三档 SceneSpec 样例 | [夜航员](scenes/night-navigator/)、[晨光温室](scenes/morning-observatory/)、[绯雨霓虹](scenes/crimson-rain/) | [复建 ZIP 与验收](../../docs/scene-samples.md) |
| 作者起步模板 | [`templates/starter`](templates/starter/) | 复制并修改后运行 `npm run pack:skin -- <源码目录> <输出目录>` |
| 人物场景作者模板 | [浅色](templates/portrait-light/)、[深色](templates/portrait-dark/)、[双明暗](templates/portrait-dual/) | [复制、打包和导入](../../docs/character-author-templates.md) |
| 独立人物 ZIP | [青笺阅览室](characters/jade-reading-room/)、[末班车札记](characters/last-train-study/)、[晨昏观测](characters/twilight-shift/) | `npm run pack:skin -- <源码目录> <输出目录>` |

内置皮肤由[引擎目录](../../src/host/built-in-skins.ts)显式登记。`pack:samples` 生成的内置示范包沿用 `.sample` ID。独立的 `pack:skin` 保留清单中的 ID，只将校验过的声明文件和资源写入 ZIP。使用该入口可交付额外的 ZIP 样例和自制皮肤。

两种打包入口均将声明文件转换为 LF 换行，素材字节原样写入。Windows 的 CRLF 检出和 LF 检出可得到相同的 ZIP。

PR-20 复验中，三套既有样例 ZIP 与 v1.0.3 基线逐字节一致。原样打包 Starter 得到 `example.starter-light.dshskin.zip`，大小 1019 字节，SHA-256 为 `789726f341e3c1303c84a55498d3ca48737dadb01b2154e6ac13b1293d01973c`。自动测试通过生产 ZIP 导入路由读取该包，并验证越界 CSS 会使打包失败。
