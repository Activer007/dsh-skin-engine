# 00 · Executive Decision

## 1. 产品定位

DSH Skin Engine 是一个**视觉主题基础设施**，而不是单纯的 CSS 主题切换器。它由一个 DSH 管理插件、一个轻量运行时、若干数据型皮肤包和一组内置视觉效果组成。

### 目标用户

- 普通用户：安装、预览、切换皮肤，调整少量视觉强度。
- 皮肤作者：通过 Manifest、Tokens、Effects Profile 和 CSS 制作皮肤，不必编写运行时。
- 引擎维护者：维护 DSH Host Adapter、内置效果和兼容性。

## 2. 产品原则

| 原则 | 含义 | 避免的反模式 |
|---|---|---|
| 一个引擎，多套皮肤 | 皮肤是资源包，不是完整插件 | 100 套皮肤 = 100 个 DSH 插件行 |
| 声明式优先 | JSON + CSS 描述视觉 | 每套皮肤自带任意 JS |
| 效果复用 | 所有皮肤调用同一效果注册表 | 每套皮肤重写粒子循环 |
| 宿主适配隔离 | 只在 Adapter 中了解 DSH 内部细节 | 皮肤直接依赖宿主私有类名 |
| 完整撤销 | 每个副作用都必须有 dispose | 卸载后遗留样式、监听器或 Canvas |
| 性能可控 | 效果按需运行、可降级 | 常驻多个 RAF / 多个全屏 Canvas |

## 3. v1 范围

### 必须做

- 本地皮肤包发现、安装、卸载、启用、预览、回滚。
- Manifest 校验与 DSH / Engine API 兼容性检查。
- Theme Tokens、CSS Loader、Host Token Adapter。
- 统一效果注册表和 Animation Scheduler。
- 8 项 Visual Effects MVP：Liquid Glass、Aurora、Floating Dust、Light Flow、Click Ripple、Starfield、Holographic Glass、Liquid Refraction。
- 皮肤管理页、基础参数配置、导入导出。
- `prefers-reduced-motion`、Page Visibility、低性能模式。

### 暂不做

- 在线皮肤市场、账号同步、评分评论。
- 任意第三方 JavaScript 执行。
- 用户可视化 Shader 编辑器。
- 完整 3D 场景编辑器、复杂物理模拟。
- 多个皮肤同时叠加运行。
- 对宿主 DOM 做大范围自动扫描和重排。

## 4. 核心架构决策

**推荐：一个 DSH Skin Engine 插件 + 独立数据型 Skin Packages。**

皮肤包在引擎专属目录中管理，由 Host 侧校验与提供静态资源；Browser Runtime 只加载当前皮肤。若 M0 发现 DSH 当前插件 API 不支持安全的本地包管理或静态资源路由，先实现“内置皮肤 + 本地目录导入”的可用闭环，不要为了在线安装提前引入复杂插件依赖管理。

## 5. 首发示例皮肤

| 皮肤 | 风格 | 默认效果组合 |
|---|---|---|
| Deep Ocean | 深海蓝、克制玻璃、安静氛围 | Liquid Glass + Floating Dust + Light Flow |
| Aurora | 冷色极光、柔和渐变 | Liquid Glass + Aurora + Floating Dust |
| Obsidian Neon | 深色、霓虹边缘、未来感 | Holographic Glass + Starfield + Light Flow |

这三套用于验证皮肤包契约，不代表 v1 必须提供皮肤商店。

## 6. 成功标准

- 新增一套纯数据皮肤，无需修改 Engine 源码。
- 安装 100 套皮肤时只加载目录与元数据，运行时只加载当前皮肤。
- 切换失败能恢复上一个皮肤或官方原生样式。
- 8 项 MVP 效果均有独立开关、参数范围和降级路径。
- 重复启用 / 禁用 100 次无明显 DOM、监听器、Canvas 或 RAF 泄漏。
- 低性能模式和减少动态效果模式下仍保持完整可用。
