import type { SkinEffect } from '../../core/effects.js'

type Ripple = Extract<SkinEffect, { id: 'interaction.ripple' }>['params']
const LIMIT = 4

export function createRipples({ durationMs, maxRadius, ringCount, color }: Ripple) {
  const rings: { x: number; y: number; started: number }[] = []
  return {
    add(x: number, y: number, now: number) {
      if (rings.length === LIMIT) rings.shift()
      rings.push({ x, y, started: now })
    },
    clear() { rings.length = 0 },
    active() { return rings.length > 0 },
    draw(context: CanvasRenderingContext2D, now: number) {
      while (rings.length > 0 && now - rings[0].started >= durationMs) rings.shift()
      if (rings.length === 0) return
      context.strokeStyle = color
      context.lineWidth = 1.5
      for (const { x, y, started } of rings) {
        const progress = Math.max(0, (now - started) / durationMs)
        const spread = 1 - (1 - progress) ** 2
        for (let ring = 0; ring < ringCount; ring++) {
          context.globalAlpha = (1 - progress) ** 1.5 * (0.49 - 0.12 * ring)
          context.beginPath()
          context.arc(x, y, (8 + (maxRadius - 8) * spread) * (1 - ring * 0.19), 0, 2 * Math.PI)
          context.stroke()
        }
      }
      context.globalAlpha = 1
    },
  }
}
