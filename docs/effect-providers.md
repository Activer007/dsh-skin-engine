# 可信效果 Provider API 1.0.0

Provider 由 Skin Engine 的可信 TypeScript 源码注册，并随 Client 一起构建。Host 和 Client 共用效果 ID、renderer 和 Zod 参数 Schema。第三方 ZIP 在 `dsh.effects/v1` 中声明已批准的 ID、启用状态、renderer 和参数。已知 ID 校验 renderer、参数和 Manifest 能力，未知 ID 记录 `unknown-effect` 后跳过。导入器继续使用现有资源白名单，ZIP 无法注册 Provider 或加载 JavaScript、GLSL。

## 新增效果

1. 在 [效果定义](../src/core/effects.ts) 添加稳定的点分 ID、`css`、`canvas2d` 或 `webgl` renderer，以及严格 Schema 和有界默认值。
2. 在 [Provider 目录](../src/client/effects/providers/) 用 `defineProvider(definition, provider)` 实现效果。`api` 使用 `EFFECT_PROVIDER_API`，`budget(quality)` 返回有效 `low`、`balanced` 或 `high` 档的预算。Economy 使用 Low 预算。预算应限制粒子数量、模糊半径、亮度或 GPU 分配等实际成本。
3. 将 Provider 加入 [Client 注册表](../src/client/effects/providers/index.ts) 的组成顺序。类型检查要求每个定义对应一个 Provider，启动时拒绝重复 ID 和版本不匹配。场景依注册顺序组合图层和绘制贡献。

| 接口 | 行为 |
| --- | --- |
| `mount(context, params)` | 接收严格校验后的参数，为活动场景创建一个实例。可返回 `undefined` 表示无需创建。运行时按 ID 去重，换场景时先释放旧所有权。 |
| `layout(state, budget)` | 读取已审计的背景和侧栏可用性、窗口模式及透明度偏好，更新自有图层并返回该效果是否占用可用表面。 |
| `update(state, budget)` | 根据有效质量、可见性、动效权限和输入表面更新资源。需要立即更新共享 Canvas 时返回 `true`。 |
| `pause()` / `resume()` | 动态绘制许可改变时调用。隐藏、Static 和减少动效会暂停动态绘制。恢复前先执行 `update`，Provider 可保留有界的相位或粒子位置。 |
| `dispose()` | 停止实例状态和监听。运行时防止重复调用，并回收本作用域的任务、图层和已登记的资源。 |
| `fallback(context, params, stage)` | 挂载、生命周期、绘制或已包装回调失败后，原作用域先清理，再以新作用域尝试一次静态回退。回退也失败则移除该效果，其他效果继续运行。 |

`context.layer()` 把装饰节点放在引擎管理的场景或侧栏。`sidebarGlass()` 用租约复用同一个玻璃节点。Provider 通过 `context.frames.add()` 使用窗口的共享时钟，Canvas 2D 通过 `instance.canvas` 提供绘制并共用一个有像素预算的画布。Provider 自行申请的监听、观察器或 GPU 资源应在分配后立即用 `context.own()` 登记，便于部分挂载失败时回收。外部回调可用 `context.guard()` 包装，作用域释放后回调失效。现有折射使用有界 WebGL 渲染器，禁用、分配失败或上下文丢失时回退 CSS 材质。

## 环境光示例

[`ambient.light`](../src/client/effects/providers/ambient-light.ts) 在对话背景右上角绘制柔光。它以共享时钟更新一个 CSS 图层的透明度，Low 和 Static 保留静态光晕，减少透明度或强制颜色时让回宿主。它可用于新 ZIP，不会自动写入已有皮肤或偏好。

```json
{
  "schema": "dsh.effects/v1",
  "effects": [
    { "id": "ambient.light", "renderer": "css", "enabled": true, "params": { "intensity": 0.14, "speed": 0.3 } }
  ]
}
```

在 `skin.json` 的 `entry.effects` 指向该文件，并在 `capabilities` 中声明 `effects:css`。`intensity` 范围为 `0` 至 `0.22`，`speed` 范围为 `0.1` 至 `1`。

## 版本演进

Provider API、皮肤包数据格式和 Engine API 分别版本化。当前注册表要求 Provider 源码声明与引擎构建内的 Provider API 版本完全一致。兼容扩展应保留现有钩子语义与资源所有权规则，随可信源码一起重新构建。变更必需钩子、生命周期顺序、预算或所有权语义时提升 Provider 主版本，同一 PR 迁移内置 Provider、版本校验和验收。已有 ZIP 的 ID、renderer、参数默认值和启用规则继续按数据契约读取。若未来需要不兼容的数据格式，单独定义新版和迁移规则。
