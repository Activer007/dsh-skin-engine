# 人物皮肤单图替换验收

## 构建与复跑

- 补丁 SHA-256 `36dfeaa9120d45005e95ca3f282c005cc1b1795fc36e11cd7c551d5d3bd876f1`。执行 `git apply --check` 时 `origin/main` 与原基线 `7e273031250b218845711f5ed6e5fc3133588a92` 一致。
- `npm ci --ignore-scripts --no-audit --no-fund`、`npm run typecheck`、`npm run lint`、`npm test`（含构建）和 `git diff --check` 通过，121 项测试、0 失败、0 跳过。
- `npm pack --ignore-scripts --pack-destination <输出目录>` 打包已构建产物。自动审查修复候选 `ed38f7437bce67ce20a1e3db430a1df8d3d1fc11` 的归档 `dsh-plugin-skin-engine-1.9.2.tgz` SHA-256 为 `d1eb6a4052abd28c9c21728e4ebe9593764175e577be515eed7e34a133de9927`。验收脚本、测试和说明均不进入包。
- 用仓库 `scripts/acceptance/portrait-artwork.mjs` 传入 `--archive <候选 tgz>`、`--previous <旧版 tgz>`、`--desktop-exe <官方 EXE>`、`--host-version 0.2.2-rc.3` 与 `--output <隔离输出目录>`。请先在仓库根目录构建。

## 检查范围

- 自动化核对空偏好重渲染、真正改动偏好、Profile 或皮肤包修订变化、主动取消和离开编辑器后的迟到结果。
- 自动化核对允许格式和尺寸、流式大小上限、路径和符号链接、内容哈希、哈希去重、32 张上限、导入拒绝私人图片引用、导出 ZIP 省略私人图片和引用。客户端预先解码，Host 对结构和尺寸独立校验。
- 桌面的首轮测试复现流式路由可上传但无法读取图片。失败记录留在 `.cache/portrait-stage1/host/desktop-YEJTfy/`。修复拆分上传 POST 和图片 GET/HEAD，后者沿用缓冲型 Fetch 路由。
- 第一次通过的 Windows Desktop 记录在 `.cache/portrait-stage1/host/desktop-PbTvo0/`。八款内置人物皮肤的换图入口均出现，夜航员横图与晨光温室竖图实测了适应/填充、位置、缩放、透明度、预览取消、应用、恢复内置图、缺图回退、停用/启用和重启。夜航员的聊天以 1280 与 980 像素宽核对了裁切、消息和输入区可读性。
- 扩展复跑使用首轮通过的候选归档（SHA-256 `9cf8d4521e3d327c5fc09ea9e35cac6655ffd4fe3b53b3ff0d023f25347ee52d`）和脚本提交 `e77be5f988f08f43ad887cbd3096f0f27e390fe3`，记录在 `.cache/portrait-stage1/host/desktop-CZkIoH/result.json`。让一次真实上传成功回执延迟交付，取消后确认未生成草稿，重新选择同文件正常。恢复原生外观后，两个测试图片文件均保留。
- 审查修复的最终复跑通过，记录在 `.cache/portrait-stage1/host/desktop-3liQJ2/result.json`。停机移走已保存的图片，重启后回退内置图；接着保存背景色，核对修订增加、原图片引用保留，恢复图片文件后仍能重新加载。其余流程同样通过，隔离进程已关闭，报告无未捕获页面异常。
- 最终截图位于 `.cache/portrait-stage1/host/desktop-3liQJ2/`，包括 `dark-editor-landscape.png`、`dark-chat-preview-wide.png`、`dark-chat-narrow.png`、`light-chat-applied-portrait.png`、`missing-image-built-in-fallback.png` 和 `light-restored-built-in.png`。
- 实测不涉及个人照片。测试图片取自随仓库分发的插画，实际宿主数据在独立 Profile，未操作本机日用配置。Web 和其他宿主版本没有进行本专项实测。

每个 Profile 最多 32 张，每张不超过 5 MiB。允许复用已存图片。放弃、取消和恢复内置图均保留图片文件，目前没有清理界面。
