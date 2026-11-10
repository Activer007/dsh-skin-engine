import type { createFrameScheduler } from './frame-scheduler.js'
import type { EffectBudget } from './quality.js'

const MAX_PIXELS = 8 * 1024 * 1024
type Draw = (context: CanvasRenderingContext2D, width: number, height: number, delta: number, budget: EffectBudget) => void

/** The scene owns one backing store and shares its drawing clock with other renderers. */
export function mountCanvas(scene: HTMLElement, scheduler: ReturnType<typeof createFrameScheduler>, draw: Draw,
  afterFrame?: () => void) {
  const document = scene.ownerDocument
  const view = document.defaultView!
  const canvas = document.createElement('canvas')
  canvas.setAttribute('data-dsh-skin-effect-layer', 'canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.hidden = true
  const context = canvas.getContext('2d', { alpha: true })
  if (!context) return

  let state: { budget: EffectBudget; visible: boolean; animated: boolean } | undefined
  let removeTask: (() => void) | undefined
  let width = 0
  let height = 0
  let dpr = 0
  let disposed = false

  function render(delta: number) {
    if (disposed || !state?.visible || width === 0 || height === 0) return
    const { budget } = state
    const scale = Math.min(view.devicePixelRatio || 1, budget.dpr, Math.sqrt(MAX_PIXELS / (width * height)))
    if (scale !== dpr) {
      dpr = scale
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
    }
    context!.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
    context!.clearRect(0, 0, width, height)
    draw(context!, width, height, delta, budget)
  }

  function resize() {
    if (disposed || !state?.visible) return
    const nextWidth = scene.clientWidth
    const nextHeight = scene.clientHeight
    if (width !== nextWidth || height !== nextHeight) {
      width = nextWidth
      height = nextHeight
      dpr = 0
    }
    render(0)
  }

  function frame(delta: number) {
    render(delta)
    afterFrame?.()
  }

  const observer = new view.ResizeObserver(resize)
  function dispose() {
    if (disposed) return
    disposed = true
    removeTask?.()
    observer.disconnect()
    view.removeEventListener('resize', resize)
    canvas.remove()
    canvas.width = canvas.height = 0
  }

  try {
    scene.append(canvas)
    observer.observe(scene)
    view.addEventListener('resize', resize)
  } catch (error) {
    dispose()
    throw error
  }
  return {
    configure(budget: EffectBudget, visible: boolean, animated: boolean) {
      if (disposed || (state?.budget === budget && state.visible === visible && state.animated === animated)) return
      const needsLayout = !state?.visible || state.budget !== budget
      state = { budget, visible, animated }
      canvas.hidden = !visible
      if (!animated && removeTask) {
        removeTask()
        removeTask = undefined
      }
      if (!visible) {
        canvas.width = canvas.height = 0
        dpr = 0
        return
      }
      if (needsLayout) resize()
      if (animated) removeTask ??= scheduler.add(frame)
    },
    redraw() { render(0) },
    dispose,
  }
}
