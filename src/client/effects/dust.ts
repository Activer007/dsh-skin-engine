import type { SkinEffect } from '../../core/effects.js'
import { createParticles } from './particles.js'
import { effectQuality, type EffectBudget } from './quality.js'

type Dust = Extract<SkinEffect, { id: 'particles.dust' }>['params']

export function createDust(params: Dust, color: string) {
  const { density, speed, sizeRange, opacity, drift } = params
  const particles = createParticles(Math.round(effectQuality.high.dust * density))
  let elapsed = 0

  return (context: CanvasRenderingContext2D, width: number, height: number, delta: number, budget: EffectBudget) => {
    const count = Math.round(budget.dust * density)
    elapsed += delta
    context.fillStyle = color
    for (let index = 0; index < count; index++) {
      const particle = particles[index]
      const depth = particle.depth
      const wave = Math.sin(elapsed * 0.55 + particle.phase)
      const travel = delta * speed * (6 + depth * 18)
      particle.x = (particle.x + drift * wave * travel / width + 1) % 1
      particle.y = (particle.y - travel / height + 1) % 1
      context.globalAlpha = opacity * (0.32 + depth * 0.68) * (0.85 + wave * 0.15)
      context.beginPath()
      context.arc(particle.x * width, particle.y * height, sizeRange[0] + depth * (sizeRange[1] - sizeRange[0]), 0, 2 * Math.PI)
      context.fill()
    }
    context.globalAlpha = 1
  }
}
