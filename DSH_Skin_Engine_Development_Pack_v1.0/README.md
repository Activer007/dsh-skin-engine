# DSH Skin Engine v1.0 · Development Blueprint

> **目标：构建 DSH 生态中轻量、可扩展、视觉表现力强的皮肤与动态特效基础设施。**
>
> 本资料包是面向后续 Codex 实施的技术蓝图，不是已经完成的插件源码。M0 必须先对目标 DSH 版本进行宿主 API 与 CSS Token 审计，再冻结适配契约。

## 一句话产品定义

**一个 DSH Skin Engine 管理多套数据型皮肤包，并通过共享的 Theme Runtime 与 Visual Effects Runtime，把静态主题、动态玻璃、环境光效和粒子交互统一运行起来。**

## 核心决策

1. **一个引擎，多个皮肤包**：皮肤不是一套完整 DSH 插件，不为每种皮肤新增一个插件入口。
2. **Manifest 驱动**：皮肤由 `skin.json + tokens.json + effects.json + theme.css + assets` 描述。
3. **数据型皮肤优先**：v1 不执行皮肤包自带 JavaScript，不加载远程脚本。
4. **效果与皮肤分离**：皮肤只选择内置效果并配置参数，效果实现由引擎统一提供。
5. **三种渲染器**：CSS、Canvas 2D 是主力；WebGL 仅用于 P2 高级效果。
6. **完整可逆**：预览、切换、卸载、失败回滚都必须恢复原生外观和 DOM 状态。
7. **先可用后扩展**：v1 先做本地皮肤包、3 套示例皮肤、8 项 Visual Effects MVP；在线市场、脚本插件和复杂 3D 暂不做。

## 资料包目录

| 路径 | 内容 |
|---|---|
| `docs/00-Executive-Decision.md` | 产品定位、关键决策、范围边界 |
| `docs/01-Product-Requirements.md` | 功能需求、用户流程、非功能要求 |
| `docs/02-Technical-Architecture.md` | 技术架构、模块职责、运行流程 |
| `docs/03-Skin-Package-Spec.md` | Manifest、皮肤包结构、数据契约 |
| `docs/04-Visual-Effects-MVP.md` | 8 项效果逐项设计与验收 |
| `docs/05-Visual-Effects-Runtime.md` | CSS / Canvas / WebGL、调度器与生命周期 |
| `docs/06-Host-Adapter-and-Coexistence.md` | DSH 宿主适配、表面所有权、共存协议 |
| `docs/07-Manager-UI-UX.md` | 皮肤管理器 UI/UX 与交互流程 |
| `docs/08-Performance-Security.md` | 性能预算、安全边界、降级策略 |
| `docs/09-Milestones-and-PR-Plan.md` | 里程碑、开发计划、PR 划分 |
| `docs/10-Codex-Task-Backlog.md` | 可直接执行的任务清单与验收标准 |
| `docs/11-Testing-and-Acceptance.md` | 测试矩阵、验收门槛 |
| `docs/12-Research-and-References.md` | 两个参考仓库的借鉴点、限制和资料来源 |
| `docs/13-Visual-Reference-Index.md` | 视觉参考图索引、开发用途说明 |
| `codex/CODEX-GOAL.md` | Codex 总目标提示词 |
| `schemas/skin-manifest.schema.json` | Skin Manifest JSON Schema |
| [`examples/`](examples/README.md) | 内置皮肤、ZIP 样例与作者起步模板 |
| `architecture/` | Mermaid 架构图与数据流图 |
| `assets/reference-images/` | 8 张效果参考图、管理器 UI 参考图、总览图（SVG + PNG） |
| `assets/runway-generated/` | AI 生成参考图任务 ID 与提示词记录 |

## 建议开发顺序

- **M0**：检查 DSH 当前版本、插件 API、可用宿主 Token 与安全挂载点，完成最小样机。
- **M1**：Manifest、Registry、Theme Runtime、CSS 加载、切换与卸载。
- **M2**：Visual Effects Runtime，完成 4 项 P0 效果。
- **M3**：皮肤管理器 UI、预览、导入导出、配置持久化。
- **M4**：3 项 P1 + 1 项 P2 效果、性能与兼容性加固。
- **M5**：10 / 100 套皮肤压力验证与发布准备。

## 重要说明

- 本资料包没有复制 `dsh-deep-whale` 的角色插画或 `dsh-wallpaper-engine` 的壁纸素材。参考仓库中部分美术资产有独立授权限制；本包中的效果图是为开发参考制作的原创矢量示意图。
- 另生成了 8 张 Runway 原创视觉概念图，生成任务 ID 与提示词记录在 `assets/runway-generated/Runway-Generated-References.md`。Runway 临时预览 URL 可能过期，长期开发以本包内的 SVG / PNG 矢量参考图为准。
- 未创建 GitHub 仓库、分支或 PR；本次只交付开发资料包。

## 开发前必读

按顺序阅读：`00 → 02 → 03 → 04 → 05 → 06 → 09 → 10 → CODEX-GOAL`。
