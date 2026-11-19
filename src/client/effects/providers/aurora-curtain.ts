import { effectDefinitions } from '../../../core/effects.js'
import { createAuroraCurtain } from '../aurora-curtain.js'
import { defineProvider, EFFECT_PROVIDER_API, type EffectLayout } from './contract.js'

const cycle = 2 * Math.PI
const frameInterval = 1 / 20
const budgets = {
  low: { width: 260, height: 103, layers: 2, motion: false },
  balanced: { width: 392, height: 156, layers: 2, motion: true },
  high: { width: 520, height: 206, layers: 3, motion: true },
} as const

function showOnCanvas(node: HTMLElement, state: EffectLayout) {
  node.hidden = !state.canvas || state.reducedTransparency
  return !node.hidden
}

export const auroraCurtain = defineProvider(effectDefinitions.auroraCurtain, {
  api: EFFECT_PROVIDER_API,
  budget: quality => budgets[quality],
  mount(context, params) {
    if (!params.intensity) return

    const container = context.layer('aurora-curtain')
    container.style.opacity = String(params.intensity)
    const surface = context.scene.ownerDocument.createElement('canvas')
    container.append(surface)
    context.own(() => { surface.width = surface.height = 0 })
    const paint = createAuroraCurtain(surface, params)
    let budget: (typeof budgets)[keyof typeof budgets] | undefined
    let phase = 0.65
    let elapsed = 0
    let playing = false
    let stop: (() => void) | undefined

    function stopFrames() { stop?.(); stop = undefined; elapsed = 0 }
    function startFrames() {
      if (!playing || stop) return
      stop = context.frames.add(delta => {
        phase = (phase + delta * params.flowSpeed * 0.82) % cycle
        elapsed += delta
        if (elapsed < frameInterval || !budget) return
        elapsed %= frameInterval
        paint(budget.width, budget.height, budget.layers, phase)
      })
    }

    return {
      layout: state => showOnCanvas(container, state),
      update(state, next) {
        if (budget !== next) {
          budget = next
          paint(next.width, next.height, next.layers, phase)
        }
        playing = !container.hidden && state.dynamic && next.motion
        if (playing) startFrames()
        else stopFrames()
      },
      pause: stopFrames,
      resume: startFrames,
      dispose: stopFrames,
    }
  },
  fallback(context, { intensity }) {
    if (!intensity) return
    const node = context.layer('aurora-curtain')
    node.setAttribute('data-dsh-skin-curtain-fallback', '')
    node.style.opacity = String(intensity)
    return { layout: state => showOnCanvas(node, state) }
  },
})
