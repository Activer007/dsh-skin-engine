# 09 · Milestones and PR Plan

## 1. 里程碑

| 里程碑 | 目标 | 主要交付 | 退出标准 |
|---|---|---|---|
| M0 · Host Audit | 确认 DSH 真实宿主契约 | API 审计、Token Map、最小挂载 POC | CSS 注入 / dispose / 资源路由可验证 |
| M1 · Core Runtime | 完成皮肤生命周期 | Manifest、Registry、Theme Runtime、Switch / Rollback | 两套皮肤可切换，失败可回滚 |
| M2 · P0 Effects | 动态视觉样板 | Liquid Glass、Aurora、Dust、Light Flow | 四项效果可组合且可关闭 |
| M3 · Manager UX | 用户可管理 | 画廊、详情、预览、导入导出、参数保存 | 无需 DevTools 即可完成安装与切换 |
| M4 · P1/P2 Effects | 扩展视觉能力 | Ripple、Starfield、Holographic、Refraction | 8 项 MVP 均可运行 / 降级 |
| M5 · Hardening | 稳定与扩展验证 | 性能、兼容、安全、10/100 包测试 | 通过验收矩阵 |

## 2. 预计工程量

按单名熟悉 DSH 的工程师 + Codex 辅助估算，约 17–25 个工程日；实际取决于 M0 中发现的宿主 API、上传接口和 CSS 适配复杂度。不要把此估算当作日历承诺。

| 阶段 | 估算 |
|---|---:|
| M0 | 2–3 天 |
| M1 | 4–6 天 |
| M2 | 4–5 天 |
| M3 | 3–4 天 |
| M4 | 3–4 天 |
| M5 | 2–3 天 |

## 3. 建议 PR 拆分

每个 PR 保持中等规模、单一目标，避免一次性大改。

| PR | 内容 | 依赖 |
|---|---|---|
| PR-01 | DSH Host Audit + Surface / Token Map + POC | 无 |
| PR-02 | Manifest Schema + Validator + Example Package | PR-01 |
| PR-03 | Skin Registry + Runtime + CSS Loader + Rollback | PR-02 |
| PR-04 | Theme Tokens + Deep Ocean 示例皮肤 | PR-03 |
| PR-05 | CSS Renderer + Liquid Glass + Aurora + Light Flow | PR-04 |
| PR-06 | Canvas Scheduler + Floating Dust | PR-05 |
| PR-07 | Skin Manager UI + Preview / Apply / Reset | PR-03 |
| PR-08 | Local Import / Export + Package Security | PR-07 |
| PR-09 | Click Ripple + Starfield + Holographic Glass | PR-06 |
| PR-10 | Optional WebGL Liquid Refraction | PR-09 |
| PR-11 | Performance / Compatibility / 10–100 Skin Tests | PR-08 / PR-10 |

## 4. PR 工作纪律

1. 每个 PR 只覆盖一个中等大小的功能目标。
2. PR 创建后等待自动 Review / CI 结果。
3. 逐条处理 Review 评论，补充测试并再次运行验证。
4. Review 与 CI 通过后再合并。
5. 合并后同步主分支，再开始下一个 PR。
6. 不允许为了追求进度跳过失败测试或隐藏兼容性问题。

## 5. 风险与决策门

- 若 M0 发现 DSH 不能安全提供皮肤静态资源，M1 暂用内置皮肤资源，不提前开发远程安装。
- 若宿主没有稳定的 Surface API，先实现有限的已验证 Surface，不做自动全页面选择器扫描。
- 若 Canvas / CSS 已满足视觉要求，Liquid Refraction 可以延后；不要为了“最强”把 WebGL 变成默认依赖。
