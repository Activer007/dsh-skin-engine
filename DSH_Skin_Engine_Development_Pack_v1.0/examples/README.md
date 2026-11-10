# 示例皮肤与作者模板

| 类别 | 源码 | 打包入口 |
| --- | --- | --- |
| 内置皮肤及对应 ZIP 样例 | [Deep Ocean](skins/deep-ocean/)、[Aurora](skins/aurora/)、[Obsidian Neon](skins/obsidian-neon/)、[纸白](skins/paper-light/)、[雾松](skins/mist-pine/)、[夜航员](skins/night-navigator/) | `npm run pack:samples -- <输出目录>` |
| 内置人物系列及对应 ZIP 样例 | [晨光温室](skins/morning-observatory/)、[青玉书库](skins/jade-archive/)、[雨夜列车](skins/rainline/) | `npm run pack:samples -- <输出目录>` |
| 内置人物续集及对应 ZIP 样例 | [蓝弧远航](skins/blue-arc/)、[曙光航站](skins/dawn-station/)、[月窗余晖](skins/moonlit-horizon/)、[绯雨霓虹](skins/crimson-rain/) | `npm run pack:samples -- <输出目录>` |
| 独立 ZIP 样例 | [`skins/ink-focus`](skins/ink-focus/)、[`skins/warm-dusk`](skins/warm-dusk/) | `npm run pack:skin -- <源码目录> <输出目录>` |
| 作者起步模板 | [`templates/starter`](templates/starter/) | 复制并修改后运行 `npm run pack:skin -- <源码目录> <输出目录>` |

内置皮肤由[引擎目录](../../src/host/built-in-skins.ts)显式登记。`pack:samples` 生成的内置示范包沿用 `.sample` ID。独立的 `pack:skin` 保留清单中的 ID，只将校验过的声明文件和资源写入 ZIP。使用该入口可交付额外的 ZIP 样例和自制皮肤。

两种打包入口均将声明文件转换为 LF 换行，素材字节原样写入。Windows 的 CRLF 检出和 LF 检出可得到相同的 ZIP。

PR-20 复验中，三套既有样例 ZIP 与 v1.0.3 基线逐字节一致。原样打包 Starter 得到 `example.starter-light.dshskin.zip`，大小 1019 字节，SHA-256 为 `789726f341e3c1303c84a55498d3ca48737dadb01b2154e6ac13b1293d01973c`。自动测试通过生产 ZIP 导入路由读取该包，并验证越界 CSS 会使打包失败。
