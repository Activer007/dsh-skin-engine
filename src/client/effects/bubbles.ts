import type { EffectParams } from '../../core/effects.js'
import { createParticles } from './particles.js'
import { effectQuality } from './quality.js'

export function createBubbles({ density: baseDensity, densityMultiplier = 1, speed, opacity }: EffectParams<'particles.bubbles'>, color: string) {
  const density = baseDensity * densityMultiplier
  const bubbles = createParticles(Math.round(effectQuality.high.bubbles * density))
  let elapsed = 0

  return (context: CanvasRenderingContext2D, width: number, height: number, delta: number, budget: number) => {
    elapsed += delta
    const count = Math.round(budget * density)
    context.strokeStyle = color
    for (let index = 0; index < count; index++) {
      const bubble = bubbles[index]
      const size = bubble.depth ** 2
      const radius = 1.4 + size * 5
      const span = height + radius * 4
      bubble.y = (bubble.y - delta * speed * (18 + size * 32) / span + 1) % 1
      const x = bubble.x * width + Math.sin(elapsed * 0.72 + bubble.phase) * (2 + size * 6)
      const y = bubble.y * span - radius * 2
      const alpha = opacity * (0.36 + size * 0.64)

      context.lineWidth = 0.65 + size * 0.5
      context.globalAlpha = alpha * 0.56
      context.beginPath()
      context.arc(x, y, radius, 0, 2 * Math.PI)
      context.stroke()

      context.globalAlpha = alpha
      context.lineCap = 'round'
      context.beginPath()
      context.arc(x, y, radius, 3.58, 4.76)
      context.stroke()
    }
  }
}
