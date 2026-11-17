import type { SkinEffect } from '../../core/effects.js'
import { createParticles } from './particles.js'
import { effectQuality, type EffectBudget } from './quality.js'

type Starfield = Extract<SkinEffect, { id: 'particles.starfield' }>['params']
const SNAP = 0.05

export function createStarfield(params: Starfield, accent: string) {
  const { starCount, brightness, parallax, twinkle, depthLayers } = params
  // A fixed seed also keeps the stationary sky stable across reloads and toggles.
  let seed = 0x2c7985ad
  const stars = createParticles(Math.min(starCount, effectQuality.high.stars), parallax === 0 ? () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 2 ** 32
  } : Math.random)
  let elapsed = 0
  let targetX = 0, targetY = 0
  let offsetX = 0, offsetY = 0

  function approach(value: number, target: number, delta: number) {
    return Math.abs(target - value) < SNAP ? target : value + (target - value) * (1 - Math.exp(-8 * delta))
  }

  return {
    point(x: number, y: number) {
      targetX = x * 26 * parallax
      targetY = y * 18 * parallax
    },
    resetPointer() { targetX = targetY = offsetX = offsetY = 0 },
    needsFrame() { return twinkle > 0 || offsetX !== targetX || offsetY !== targetY },
    draw(context: CanvasRenderingContext2D, width: number, height: number, delta: number, budget: EffectBudget, motion: boolean) {
      if (motion) {
        elapsed += delta
        offsetX = approach(offsetX, targetX, delta)
        offsetY = approach(offsetY, targetY, delta)
      }
      const count = Math.min(stars.length, budget.stars)
      for (let index = 0; index < count; index++) {
        const star = stars[index]
        const depth = (1 + Math.floor(star.depth * depthLayers)) / depthLayers
        const flicker = motion ? Math.sin(elapsed * (1.3 + star.depth) + star.phase) * twinkle * 0.45 : 0
        const x = (star.x + (motion ? offsetX * depth / width : 0) + 1) % 1 * width
        const y = (star.y + (motion ? offsetY * depth / height : 0) + 1) % 1 * height
        const bright = index % 9 === 0
        context.fillStyle = bright ? accent : '#dce9ff'
        context.globalAlpha = brightness * (bright ? 1 : 0.4 + star.depth * 0.55) * (0.84 + flicker)
        context.beginPath()
        context.arc(x, y, bright ? 1.45 + star.depth * 0.6 : 0.45 + star.depth * 0.8, 0, 2 * Math.PI)
        context.fill()
      }
      context.globalAlpha = 1
    },
  }
}
