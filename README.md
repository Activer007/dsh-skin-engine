# DSH Skin Engine

Skin Engine 是 DeepSeek Harness 的外观插件。在左侧「外观中心」浏览皮肤、调整特效、替换人物插画，并在真实聊天里预览效果。

## 项目亮点

- **13 款内置皮肤**涵盖深色、浅色、动态特效和人物插画。皮肤库支持搜索、筛选、收藏及按最近应用排序。
- **八款人物皮肤支持换图**。选择本地 PNG、JPEG 或 WebP，可调整适应／填充、位置、缩放和不透明度，也可恢复内置图。私人图片按 DSH Profile 保存，导出 ZIP 时会排除。
- **30 秒聊天预览**显示实时倒计时。主动取消会回到发起预览的页签，保留未应用草稿。
- **按窗口调整特效**，可调整模式和质量，也可从外观中心和系统设置恢复 DSH 原生外观。
- **本地 ZIP 管理**支持导入、导出、更新和回滚。支持明暗两套配色与插画的皮肤可以跟随 DSH 外观切换。

## 安装

当前版本为 **1.9.3**，要求 **DSH 0.2.2-rc.1 或更新版本**。在 GitHub Releases 下载安装包和 SHA-256 校验文件。升级前退出目标 Profile 并备份原版插件包和皮肤数据。 [GitHub Releases](https://github.com/Activer007/dsh-skin-engine/releases) · [升级与回装说明](docs/release-v1.md#v193-人物皮肤换图)

在已退出的 Windows Desktop 上，可用随应用安装的 DSH CLI 将归档原地安装到 `desktop` Profile。将示例里的路径换成实际文件路径，然后重新打开 DSH。

```powershell
& '<DSH 安装目录>/resources/runtime/cli/bin/dsh.cmd' plugin --profile desktop add 'file:E:/path/to/dsh-plugin-skin-engine-1.9.3.tgz'
```

Web 使用目标 Profile 的 DSH CLI 安装，安装后重启该 Web Host。

```sh
dsh plugin --profile web add -w file:/absolute/path/to/dsh-plugin-skin-engine-1.9.3.tgz
```

## 试用人物换图

打开「外观中心 → 皮肤库」，选择「夜航员」等人物皮肤，在右侧「人物场景图片」下选择一张图片。先在聊天中预览，满意后点「应用并保存」。每个 Profile 最多保存 32 张，每张最大 5 MiB。恢复内置图、取消或放弃草稿都会保留图片文件。 [换图说明与限制](docs/user-artwork-stage1.md)

[外观中心操作手册](docs/navigation-release-guide.md#当前主线的操作入口) · [兼容性与实测范围](docs/dsh-compatibility.md) · [SceneSpec 皮肤作者文档](docs/scene-spec.md) · [开发路线图](docs/development-roadmap.md)
