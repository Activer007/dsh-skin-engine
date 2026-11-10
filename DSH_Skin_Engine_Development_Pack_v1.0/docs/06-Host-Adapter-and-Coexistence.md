# 06 · Host Adapter and Coexistence

## 1. 为什么需要 Adapter

皮肤不应该知道 DSH 内部 DOM 的全部细节。DSH 的 CSS 类名、布局结构和组件可能升级；把这些细节散落在 100 套皮肤中，会形成维护灾难。

Adapter 负责维护一个按 DSH 版本验证的表面映射：

| Surface ID | 用途 | 接管策略 |
|---|---|---|
| `app.canvas` | 页面背景 / 主画布 | 仅背景装饰，不改变内容树 |
| `app.sidebar` | 左侧导航 | 可选玻璃，保留滚动和点击 |
| `app.topbar` | 顶部栏 | 可选轻量玻璃 |
| `app.inspector` | 右侧检查器 | 可选玻璃，保持面板层级 |
| `app.dialog` | 弹窗 | 默认 preserve，除非专门验证 |
| `app.editor` | 输入 / 编辑器 | 永远 preserve，不覆盖编辑器内部 |

表面选择器必须在 M0 从目标 DSH 源码与运行时 DOM 实测得出，不能凭猜测写死。

## 2. 表面所有权原则

借鉴 `dsh-wallpaper-engine` ADR-0015：

1. **先判定所有权，再绘制**：只处理 Adapter 明确登记且验证过的 Surface。
2. **装饰不得改变共享内容层叠结构**：不为宿主共享祖先新增 `position`、`filter`、`isolation` 或 z-index。
3. **未知内容保留原生**：不通过猜测私有类名自动接管。
4. **装饰节点是叶节点**：玻璃模糊和光影放在独立装饰层，不移动宿主内容节点。
5. **退出可逆**：只撤销本引擎仍然拥有的属性和样式；若属性已被其他插件改写，不覆盖对方状态。

## 3. 共存协议

- 激活皮肤时，在 `document.documentElement` 写入 `data-dsh-skin="<skinId>"`。
- 内部识别使用 `data-dsh-skin-id="<skinId>"`。
- 这保留与 `dsh-wallpaper-engine` 已有 `html[data-dsh-skin]` 让路机制的兼容性。
- 禁用或卸载时只移除本引擎拥有的值。
- 若检测到其他皮肤管理器正在接管同一宿主，显示冲突提示，不同时启用两个管理器。
- 与 Wallpaper Engine 共存：Wallpaper Engine 负责壁纸，Skin Engine 负责主题；当 `data-dsh-skin` 标记出现时，Wallpaper Engine 按其公开契约让路。

## 4. 兼容性

Manifest 声明：

- `engineApi`：Skin Engine API 范围。
- `dshCompatibility`：DSH 版本范围。
- `tokenSchema`：Token 映射版本。
- `effectsSchema`：Effects Profile 版本。

不兼容时禁止激活，提供「恢复官方默认」；不提供未经确认的强制放行。

## 5. Adapter 验收

- DSH 深色 / 浅色模式切换后，Tokens 正确更新。
- 侧栏折叠、窗口缩放、滚动、弹窗和设置面板层级不回归。
- 关闭 Skin Engine 后页面回到 DSH 原生外观。
- Wallpaper Engine 与其他插件不被覆盖；不通过修改对方私有状态实现共存。
