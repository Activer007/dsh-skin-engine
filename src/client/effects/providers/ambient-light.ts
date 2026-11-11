import { effectDefinitions } from '../../../core/effects.js'
import { defineProvider, EFFECT_PROVIDER_API } from './contract.js'

const budgets = {
  low: { opacity: 0.08, pulse: false },
  balanced: { opacity: 0.16, pulse: true },
  high: { opacity: 0.22, pulse: true },
} as const

export const ambientLight = defineProvider(effectDefinitions.ambientLight, {
  api: EFFECT_PROVIDER_API,
  budget: quality => budgets[quality],
  mount(context, { intensity, speed }) {
    if (intensity === 0) return
    const node = context.layer('ambient-light')
    node.style.setProperty('--dsh-ambient-accent', context.accent)
    let releaseFrame: (() => void) | undefined
    let phase = 0
    let opacity = 0
    let animate = false
    let moving = false

    function paint() { node.style.opacity = String(opacity * (0.85 + 0.15 * Math.cos(phase))) }
    function stopFrames() {
      releaseFrame?.()
      releaseFrame = undefined
      node.style.opacity = String(opacity)
    }
    function startFrames() {
      if (!animate || releaseFrame) return
      releaseFrame = context.frames.add(delta => {
        phase = (phase + delta * speed * Math.PI) % (Math.PI * 2)
        paint()
      })
    }
    return {
      layout(state) {
        node.hidden = !state.canvas || state.reducedTransparency
        return !node.hidden
      },
      update(state, budget) {
        opacity = Math.min(intensity, budget.opacity)
        animate = !node.hidden && state.dynamic && budget.pulse
        if (animate && moving) { paint(); startFrames() } else stopFrames()
      },
      pause() { moving = false; stopFrames() },
      resume() { moving = true; startFrames() },
    }
  },
})
