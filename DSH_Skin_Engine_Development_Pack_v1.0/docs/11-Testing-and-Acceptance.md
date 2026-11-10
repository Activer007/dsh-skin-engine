# 11 · Testing and Acceptance

## 1. 单元测试

- Manifest 必需字段、未知字段、SemVer、ID、路径校验。
- Tokens 类型、颜色格式、数值范围和默认值。
- Effects Profile 的内置 ID 与参数边界。
- Preferences 合并、导入、导出和迁移。
- `dispose()` 幂等；`update()` 不重复挂载。

## 2. 浏览器集成测试

- 首次启动 Default。
- Deep Ocean → Aurora → Obsidian Neon 即时切换。
- 预览后取消、预览超时、刷新页面恢复。
- 故意损坏 CSS / 资源后回滚。
- DSH 浅色 / 深色切换。
- 窄窗口、侧栏折叠、滚动、设置页、弹窗和编辑器。
- `prefers-reduced-motion` 与页面隐藏暂停。
- Wallpaper Engine 与第三方插件共存。

## 3. 性能测试

| 测试 | 目标 |
|---|---|
| 仅静态主题 | 无常驻 RAF |
| P0 四效果组合 | 平衡档稳定运行，无明显输入延迟 |
| 100 个皮肤包 | 元数据扫描不加载全部 CSS / 图片 |
| 100 次皮肤切换 | 无 style / canvas / listener 泄漏 |
| 后台标签页 5 分钟 | 环境动画暂停，恢复后无时间跳跃 |
| WebGL 上下文丢失 | 自动回退，不影响 UI 交互 |

记录 FPS、Long Tasks、内存、Canvas 数量、活动 RAF 数和 GPU 资源状态。不要只凭主观感受判定性能。

## 4. 视觉验收

- 8 项效果逐一对照 `assets/reference-images/`。
- 玻璃效果不降低正文可读性。
- Aurora / Light Flow 不盖住内容。
- Dust / Starfield 不像噪点，不产生明显闪烁。
- Click Ripple 不抢焦点、不拦截点击。
- Holographic Glass 只在边缘呈现虹彩。
- Liquid Refraction 不扭曲实际文字。

## 5. 安全测试

- ZIP Slip / 路径穿越。
- ZIP Bomb / 过大解压体积。
- `@import` / 外部 `url()` / data URL。
- 非白名单文件类型。
- Manifest 中未知 capability。
- 同名皮肤、重复 ID、损坏文件。
- 皮肤包升级中断与磁盘写入失败。

## 6. 发布验收门槛

MVP 可以发布的最低条件：

1. M0 宿主适配有实测记录。
2. M1 生命周期可逆，至少两套皮肤可切换。
3. P0 四项效果可同时运行并可关闭。
4. 皮肤管理 UI 可预览、应用和恢复。
5. 所有安全负向测试通过。
6. 无 P0 / P1 级已知兼容问题。
7. 有性能基线与回滚说明。
