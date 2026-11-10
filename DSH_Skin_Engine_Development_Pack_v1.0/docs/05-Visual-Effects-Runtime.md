# 05 · Visual Effects Runtime

## 1. 核心结构

```text
VisualEffectsRuntime
├── EffectRegistry          # 内置效果清单、参数 Schema、渲染器类型
├── EffectResolver          # 合并皮肤配置、用户覆盖和性能档
├── AnimationScheduler      # 一个共享 RAF 调度器
├── QualityManager          # 设备能力、帧耗时、降级
├── InteractionHub          # Pointer / Click / Resize / Visibility
└── Renderers
    ├── CSSRenderer         # CSS 变量、样式层和 transition
    ├── Canvas2DRenderer    # Dust / Starfield / Ripple
    └── WebGLRenderer       # Liquid Refraction（P2）
```

## 2. Effect Definition

每个内置效果声明：

- `id`：稳定 ID，例如 `ambient.aurora`。
- `renderer`：`css | canvas2d | webgl`。
- `schema`：参数校验规则。
- `mount(context, params)`：创建效果。
- `update(params)`：更新参数，不重复挂载。
- `pause()` / `resume()`：可见性和性能调度。
- `dispose()`：幂等释放全部副作用。

皮肤包只能配置这些定义，不提供自定义 `mount()` 函数。

## 3. Scheduler 规则

- 全部持续动画共享一个 RAF，不允许每个效果各自无限循环。
- 没有活动动画时不请求下一帧。
- `document.visibilityState !== 'visible'` 时暂停环境动画。
- `prefers-reduced-motion: reduce` 时只保留必要交互反馈。
- 根据帧耗时和用户质量档调整粒子数、模糊强度和更新频率。
- 交互反馈可以短时提高帧率，结束后回到环境动画档。

建议 API：

```ts
interface EffectHandle {
  update(params: unknown): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

interface EffectContext {
  root: HTMLElement;
  canvas?: HTMLCanvasElement;
  reducedMotion: boolean;
  quality: 'low' | 'balanced' | 'high';
  invalidate(): void;
  onPointer(listener: (event: PointerEvent) => void): () => void;
}
```

## 4. Renderer 选择

| 效果 | v1 Renderer | 理由 |
|---|---|---|
| Liquid Glass | CSS | 浏览器原生合成能力，样式表达足够 |
| Aurora | CSS | 少量渐变层 + transform |
| Floating Dust | Canvas 2D | 避免大量 DOM，绘制简单 |
| Light Flow | CSS / SVG | 轻量、易配置 |
| Click Ripple | Canvas 2D | 复用 Canvas 与事件中心 |
| Starfield | Canvas 2D | 与 Dust 共用粒子数据结构 |
| Holographic Glass | CSS | 渐变、mask 和局部 Pointer 变量 |
| Liquid Refraction | WebGL | 需要像素级位移与色散 |

## 5. Canvas 2D 粒子模型

```ts
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  depth: number;
  kind: 'dust' | 'star' | 'ripple';
  life?: number;
}
```

- Dust 与 Starfield 使用同一个 `ParticleSystem`。
- Ripple 是短生命周期对象，复用同一绘制层。
- Canvas 的 `pointer-events` 必须为 `none`。
- DPR 上限：默认 1.5，低档 1.0，高档 2.0。
- ResizeObserver 只挂在 Canvas 根容器上，dispose 时释放。

## 6. 生命周期

`mount -> update -> pause/resume -> dispose` 必须形成闭环。

dispose 清单：

- cancelAnimationFrame。
- removeEventListener。
- disconnect ResizeObserver / MutationObserver。
- 移除 `<canvas>` / `<style>` / `<link>`。
- 清空 CSS Variables 和引擎自有 data attributes。
- WebGL 释放纹理、缓冲区、程序和上下文资源。

重复调用 dispose 不得报错，也不得恢复已经被其他插件接管的属性。
