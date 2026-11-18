# DSH Skin Engine v1 素材与第三方许可

## 自制美术素材原创声明（2026-11-18 作者确认）

本项目内置皮肤与官方样例所使用的人物插画、壁纸、场景图像及相关美术元素，均由项目作者自行创作或借助生成工具独立生成，没有直接复制其他项目的美术资源。此前记录的“用户附件”是项目作者提供原始作品的交付方式，不代表素材来自第三方。

皮肤美术素材的原创声明与第三方技术组件、DeepSeek Harness 界面/名称/标志的权利归属是两回事。屏幕截图和演示视频由项目自行采集，画面中 DSH 的界面和标志仍归相应权利人；第三方依赖继续遵循自己的许可证与 Notice。本记录保留哈希、文件路径和生成技术信息供构建审计。

## 人物作者模板与独立样例

浅色、深色和双明暗模板与独立样例新增 8 个插画路径，分别复用青玉书库、雨夜列车、晨光温室和夜航员的原始 WebP 字节。样例新增 4 张官方 Web 隔离会话实拍 PNG，保留 1280 × 820 尺寸和原始截图字节。截图由项目在隔离会话中自行采集，画面中的 DSH 界面及标志仍归相应权利人。 [作者模板与预览](character-author-templates.md) · [逐文件清单](release-assets.json)

## NEXT-13 发包资产清单

[逐文件清单](release-assets.json)随引擎 tarball 提供，记录 33 个源路径、28 份不同的图像字节。范围为 13 套内置皮肤及其 ZIP、静墨和暖暮独立 ZIP、三套 SceneSpec 样例、夜航员轻量视差样例，以及引擎的探测图标和预览占位。双明暗夹具引用清单内两张插画，夹具 ZIP 仅供验收。

每行的格式、像素尺寸、字节数和 SHA-256 取自实际发包源文件。来源、作者或生成方式、原创说明及转换方法通过该行的 `provenance` 查阅。`original` 记录本轮能够定位并读取的原始 PNG。对于直接随包复制的 PNG，清单中的哈希就是该采集文件的哈希。SVG 行尾统一为 LF 后计算哈希和包内文件名。

| SHA-256 前缀 | 同一字节的使用处 |
| --- | --- |
| `fb4a6d6e24ba` | 夜航员内置版、SceneSpec 和轻量视差的插画，以及双明暗夹具的 `assets/night.webp` |
| `7fae5b2d67dd` | 晨光温室内置版和 SceneSpec 的插画，以及双明暗夹具的 `assets/day.webp` |
| `bb083c08c189` | 绯雨霓虹内置版和 SceneSpec 的插画，来自用户附件 4 |
| `f0d0c6e81e80` | 夜航员 SceneSpec 和轻量视差的画廊预览 |

内置 ZIP 直接复制对应 tarball 皮肤的素材。上述相同字节的条目保留各自的包内路径。运行时 `skinId` 和素材声明保持原有值。

**原创情况更新**：项目作者已确认此前作为四张附件提供的插画以及由 imagegen 生成的系列插画均是自行创作或独立生成，未直接复制第三方美术资源，因此不再将这些自制插画标为“原作者或再分发授权待确认”。原始 PNG、截图采集文件及编码参数的归档完整性属于技术追溯事项，与原创确认分开；需要复建时继续以清单中已登记的字节和哈希为准。

在 Node.js 24 环境执行以下命令。第一条打包命令校验原始资源，并生成 13 套内置 ZIP。最后一条在两个独立检出中重建引擎和样例，包括静墨、暖暮、三套 SceneSpec、轻量视差及 Starter。报告校验 tarball 和 ZIP 实际条目、媒体哈希及样例 `skinId`。更换素材时更新清单的来源与哈希，再复跑检查。原编码参数缺失时，以仓库中的已登记 WebP 为可复建打包源。

```powershell
npm ci --ignore-scripts
npm run pack:samples -- .cache/next-13/samples
npm run verify:local -- trusted-commit <当前提交的完整SHA> .cache/next-13/verify
```

缺失文件、路径大小写差异、未登记或字节不符的素材，以及意外进入输出目录的文件都会让打包检查失败。双明暗夹具的两个实际 ZIP 条目由仓库测试比对清单中的哈希。

## NEXT-05 场景样例

夜航员、晨光温室和绯雨霓虹的独立场景包沿用下文记录的原始插画 WebP 字节。每套画廊预览取自官方 DSH Web `0.2.2-rc.1` 隔离会话的标准动效实拍，界面和标志归相应权利人。 [打包和验收记录](scene-samples.md)

NEXT-09 的「夜航员 · 轻量视差」沿用夜航员场景版的插画和画廊预览字节。动效验收另存官方宿主的宽窗与窄窗实拍。 [轻量视差样例](scene-motion.md)

## v1.4 人物续集

四款皮肤采用项目作者自行创作或生成、随后作为附件提供的四张原创插画。原图按原始尺寸和构图从 PNG 转码为 WebP。画廊缩略图来自官方 DSH Web `0.2.2-rc.1` 的隔离空白会话，界面和标志归相应权利人。

| 附件顺序 | 随包插画 | DSH 外观 |
| --- | --- | --- |
| 1 | [蓝弧远航](../skin-sources/examples/skins/blue-arc/assets/portrait.webp) | 深色 |
| 2 | [曙光航站](../skin-sources/examples/skins/dawn-station/assets/portrait.webp) | 浅色 |
| 3 | [月窗余晖](../skin-sources/examples/skins/moonlit-horizon/assets/portrait.webp) | 深色 |
| 4 | [绯雨霓虹](../skin-sources/examples/skins/crimson-rain/assets/portrait.webp) | 深色 |

## 既有皮肤与运行时素材

引擎随附 Deep Ocean、Aurora 和 Obsidian Neon 的声明式样板、引擎自有探测图标和通用预览占位。三套深色预览来自官方 DeepSeek Harness `0.2.2-rc.1` 的隔离空白会话，展示样板在宿主中的实际渲染。界面和标志归其相应权利人。独立样板 ZIP 和引擎包使用同一组预览。

纸白的 `preview/light.png` 来自官方 DSH Web `0.2.2-rc.1` 在 Chrome 中的隔离空白会话，尺寸为 1280 × 820。该图在浅色模式实际应用纸白后截取，界面和标志归相应权利人。采集记录位于 `.cache/pr-19/prototype-web-pXmCwW/`。

静墨和暖暮的 `preview/dark.png` 来自官方 DSH Web `0.2.2-rc.1` 在 Chrome 中的隔离空白会话，均为 1280 × 820。在深色模式分别导入及应用两套源码的预览前 ZIP 后截取，暖暮保留侧栏玻璃和边缘流光。界面和标志归相应权利人。采集记录位于 `.cache/pr-21/preview-9fbTZR/`。

夜航员的 `assets/navigator.webp` 是用内置 imagegen 生成的原创插画，由生成的 PNG 转码为 WebP。生成提示如下。

> Use case: illustration-story. Original landscape background art for a dark desktop coding/chat application theme called 夜航员 (Night Navigator). A solitary adult East Asian female space navigator, original fictional character in an understated charcoal flight jacket with small amber hardware, positioned at the far right edge (face centered about 86% across, 38% down), waist-up in profile looking to the right through a ship's window. Cinematic painted editorial sci-fi, muted navy and indigo with a restrained amber rim light. Keep the entire left two thirds and lower central area softly textured deep navy with little detail and no bright highlights, so white interface text remains legible. Avoid strong highlights behind the character, busy starfields, readable text, logos, watermarks, UI, or existing franchise designs. Fill the landscape frame.

雾松的 `preview/light.webp` 和夜航员的 `preview/dark.webp` 取自官方 DSH Web `0.2.2-rc.1` 的隔离空白会话，保留 1280 × 820 尺寸。文件大小分别为 18 020 和 22 446 字节。界面和标志归相应权利人。

## v1.3 人物系列

三幅插画使用内置 imagegen，以夜航员的原画作为人物身份参考。生成的 PNG 转码为 WebP，分别保存在 晨光温室 (private archive)、[青玉书库](../skin-sources/examples/skins/jade-archive/assets/portrait.webp)和雨夜列车 (private archive)的皮肤包内。画廊缩略图来自官方 DSH Web `0.2.2-rc.1` 的隔离空白会话，原始尺寸为 1280 × 820。

**晨光温室**

> Create a different scene as a 16:9 DSH workspace wallpaper. Use the supplied Night Navigator portrait as an identity reference for the same adult East Asian woman. Keep her distinctive profile: nose, eye and eyebrow shape, lips, jaw and age. She is at the far right in profile, face around 87% across and 33% down, leaving the left 70% of the frame and the lower center even and quiet for conversation UI. Portrait silhouette stays mainly inside the rightmost 32%. No text, logos, UI, or watermarks. Light mode. Pale cool ivory background around #f4f3eb, pale warm sunlight. The same woman in a contemporary cream field coat, sage scarf and loose low braid in a minimalist botanical observatory. Soft watercolor and fine pencil, subtle paper grain. Faint sage botanical detail limited to the far right behind her. Portrait is naturalistic with enough contrast to remain visible after a low-opacity blend. Make the background color blend all the way to the upper and lower edges.

**青玉书库**

> Create a different scene as a 16:9 DSH workspace wallpaper. Use the supplied Night Navigator portrait as an identity reference for the same adult East Asian woman. Keep her distinctive profile: nose, eye and eyebrow shape, lips, jaw and age. She is at the far right in profile, face around 87% across and 33% down, leaving the left 70% of the frame and the lower center even and quiet for conversation UI. Portrait silhouette stays mainly inside the rightmost 32%. No text, logos, UI, or watermarks. Light mode. Pale jade-gray background around #eaf0ee. The same woman in a dark teal linen stand-collar jacket, black hair in a swept-back bun, in a quiet print archive. Contemporary ink and woodblock illustration, with muted jade ink, understated texture and restrained shapes. Keep the face realistic and recognizably the same. Any architectural detail stays along the right edge.

**雨夜列车**

> Create a different scene as a 16:9 DSH workspace wallpaper. Use the supplied Night Navigator portrait as an identity reference for the same adult East Asian woman. Keep her distinctive profile: nose, eye and eyebrow shape, lips, jaw and age. She is at the far right in profile, face around 87% across and 33% down, leaving the left 70% of the frame and the lower center even and quiet for conversation UI. Portrait silhouette stays mainly inside the rightmost 32%. No text, logos, UI, or watermarks. Dark mode. Solid low-contrast burgundy-charcoal background around #201821. The same woman in a plum raincoat over a charcoal turtleneck, straight shoulder-length dark hair tucked behind one ear. Painterly film noir with dusty coral reflections and fine rain beyond a city train window. Keep street lights and their reflections subdued and to the far right. Use the reference's anatomically natural profile.

参考仓库用于理解宿主接入和共存行为。发行包的素材清单由样板 Manifest 和构建入口限定，Runway 概念图、参考插件壁纸和角色插画保存在发行清单之外。用户自行安装的素材由各自皮肤包携带。

`lib/THIRD-PARTY-NOTICES.txt` 由构建根据 Host 和 Client 实际打包的模块生成，包含对应版本的许可文本。React 及 DSH 客户端服务由宿主提供。样板 ZIP 仅包含 Manifest、令牌、效果参数、受限 CSS、预览和清单声明的皮肤素材。
