import type { SkinEffect } from '../../core/effects.js'
import type { createFrameScheduler } from './frame-scheduler.js'

type Holographic = Extract<SkinEffect, { id: 'glass.holographic' }>['params']

const spectra = {
  prism: '#69e1ef, #9393ff, #ef95f4, #89dfd6',
  cool: '#87f1f8, #759df8, #b9a8ff, #85d9ff',
  warm: '#ffd197, #f6a6b7, #d6a1f7, #f8c288',
}

export function createHolographic(node: HTMLElement, params: Holographic, scheduler: Pick<ReturnType<typeof createFrameScheduler>, 'add'>) {
  const { iridescence, edgeWidth, pointerInfluence, spectrum, intensity } = params
  const style = node.style
  style.setProperty('--dsh-holo-spectrum', spectra[spectrum])
  style.setProperty('--dsh-holo-edge', `${edgeWidth}px`)
  style.setProperty('--dsh-holo-rim-alpha', String(intensity * (0.26 + 0.74 * iridescence)))
  style.setProperty('--dsh-holo-light-alpha', String(intensity * (0.1 + 0.24 * iridescence)))
  let pending: { x: number; y: number } | undefined
  let release: (() => void) | undefined

  function flush() {
    release?.()
    release = undefined
    const point = pending
    pending = undefined
    if (!point) return
    const rect = node.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const x = Math.max(0, Math.min(1, (point.x - rect.left) / rect.width)) - 0.5
    const y = Math.max(0, Math.min(1, (point.y - rect.top) / rect.height)) - 0.5
    style.setProperty('--dsh-holo-x', `${(50 + 100 * x * pointerInfluence).toFixed(1)}%`)
    style.setProperty('--dsh-holo-y', `${(24 + 48 * y * pointerInfluence).toFixed(1)}%`)
    style.setProperty('--dsh-holo-angle', `${(155 + 120 * x * pointerInfluence).toFixed(1)}deg`)
  }

  return {
    point(x: number, y: number) {
      pending = { x, y }
      release ??= scheduler.add(flush)
    },
    reset() {
      release?.()
      release = pending = undefined
      for (const key of ['--dsh-holo-x', '--dsh-holo-y', '--dsh-holo-angle']) style.removeProperty(key)
    },
  }
}
