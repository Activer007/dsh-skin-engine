import { effectDefinitions } from '../../../core/effects.js'
import { defineProvider, EFFECT_PROVIDER_API } from './contract.js'

// One small translucent texture is shared by all shafts. Its widening profile models
// scattering with depth, while the thinner, brighter core fades near the surface.
function makeShaft(document: Document, scatter: number) {
  const tile = document.createElement('canvas')
  tile.width = 96
  tile.height = 192
  const ctx = tile.getContext('2d')
  if (!ctx) throw new Error('Ocean lightfield needs Canvas 2D')
  const image = ctx.createImageData(tile.width, tile.height)
  for (let y = 0; y < tile.height; y++) {
    const depth = y / (tile.height - 1)
    const radius = 0.19 + depth * (0.27 + scatter * 0.32)
    const falloff = (1 - depth) ** 1.55
    for (let x = 0; x < tile.width; x++) {
      const lateral = (2 * x / (tile.width - 1) - 1) / radius
      const haze = Math.exp(-1.8 * lateral * lateral)
      const core = Math.exp(-10 * (lateral + 0.28) ** 2)
      const light = haze * 0.68 + core * (1 - depth) * 0.32
      const index = 4 * (y * tile.width + x)
      image.data[index] = 91 + 62 * core
      image.data[index + 1] = 223 - 39 * depth
      image.data[index + 2] = 224 + 18 * depth
      image.data[index + 3] = 255 * light * falloff
    }
  }
  ctx.putImageData(image, 0, 0)
  return tile
}

const shafts = [
  { x: 0.17, width: 0.32, depth: 0.96, slope: 0.39, opacity: 0.89, phase: 1.4 },
  { x: 0.46, width: 0.23, depth: 0.74, slope: 0.30, opacity: 0.69, phase: 3.7 },
  { x: 0.27, width: 0.15, depth: 0.85, slope: 0.41, opacity: 0.72, phase: 2.2 },
  { x: 0.65, width: 0.41, depth: 0.67, slope: 0.28, opacity: 0.49, phase: 5.2 },
  { x: 0.06, width: 0.12, depth: 0.63, slope: 0.44, opacity: 0.57, phase: 0.9 },
]

export const oceanLightfield = defineProvider(effectDefinitions.oceanLightfield, {
  api: EFFECT_PROVIDER_API,
  budget: quality => ({ low: 2, balanced: 4, high: 5 })[quality],
  mount(context, { intensity, beamLength, drift, scatter, beamCount }) {
    if (!intensity) return
    const tile = makeShaft(context.scene.ownerDocument, scatter)
    context.own(() => { tile.width = tile.height = 0 })
    let count = 0
    let motion = false
    let visible = false
    let time = 0
    return {
      update(state, limit) {
        const previous = visible
        visible = state.canvas && !state.reducedTransparency
        count = Math.min(beamCount, limit)
        motion = visible && state.dynamic && state.quality !== 'low' && drift > 0
        return previous !== visible
      },
      canvas: {
        visible: () => visible,
        animated: () => motion,
        draw(ctx, width, height, delta) {
          if (motion) time += delta
          const swell = Math.sin(time * 0.27)
          for (const shaft of shafts.slice(0, count)) {
            const ripple = Math.sin(time * 0.41 + shaft.phase)
            const length = height * beamLength * shaft.depth
            const breadth = width * shaft.width * (1 + drift * ripple * 0.14)
            const source = width * (shaft.x + drift * (swell * 0.023 + ripple * 0.014))
            ctx.save()
            ctx.globalAlpha = intensity * shaft.opacity * (0.94 + 0.06 * drift * ripple)
            ctx.transform(1, 0, shaft.slope + drift * (swell + ripple) * 0.042, 1, source, 0)
            ctx.drawImage(tile, -breadth / 2, 0, breadth, length)
            ctx.restore()
          }
        },
      },
    }
  },
  fallback(context, { intensity, beamLength }) {
    if (!intensity) return
    const layer = context.layer('ocean-lightfield-fallback')
    Object.assign(layer.style, { position: 'absolute', inset: '0', height: beamLength * 100 + '%',
      opacity: String(intensity), background: 'radial-gradient(ellipse at 25% -35%, #59d5dd80, transparent 65%)' })
    return { layout(state) { layer.hidden = !state.canvas || state.reducedTransparency; return !layer.hidden } }
  },
})
