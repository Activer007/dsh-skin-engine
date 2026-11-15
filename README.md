# DSH Skin Engine

Skin Engine 为 DeepSeek Harness 提供数据型皮肤、聊天预览和本地 ZIP 管理。

截至 R1 基线 `86a024d`，GitHub 最新正式发行版为 **v1.8.2**，主线包版本为 **1.9.0**。1.9.0 在 Windows Desktop 安装验收中已加载外观中心。以下使用入口适用于主线 1.9.0 候选。正式发行包及其操作记录见 [GitHub Releases](https://github.com/Activer007/dsh-skin-engine/releases) 和 [历史安装记录](docs/release-v1.md)。

在已退出的 Windows Desktop 上，可用随应用安装的 DSH CLI 将归档原地安装到 `desktop` Profile。将示例里的路径换成实际文件路径，然后重新打开 DSH。

```powershell
& '<DSH 安装目录>/resources/runtime/cli/bin/dsh.cmd' plugin --profile desktop add 'file:E:/path/to/dsh-plugin-skin-engine-1.9.0.tgz'
```

Web 使用目标 Profile 的 DSH CLI 安装，安装后重启该 Web Host。

```sh
dsh plugin --profile web add -w file:/absolute/path/to/dsh-plugin-skin-engine-1.9.0.tgz
```

- 从左侧「外观中心」浏览皮肤、收藏、排序、调整皮肤特效和管理 ZIP。确认当前聊天可见后，「在聊天中预览」会启动约 30 秒的预览。
- 从「设置 → 皮肤引擎」调整当前窗口效果、查看 Host 诊断、取消预览或恢复默认外观。
- 恢复默认外观会清除已保存的皮肤选择，皮肤包和各皮肤的偏好可在再次应用时继续使用。

[操作手册](docs/navigation-release-guide.md#当前主线的操作入口) · [宿主版本与实测范围](docs/dsh-compatibility.md) · [R1 进展](docs/appearance-center-stage1.md#当前进度与-r1-发布准备)
