import type { EffectParams } from '../../core/effects.js'

const cycle = 2 * Math.PI
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}
type Color = readonly [number, number, number]

const sheets = [
  { base: 0.40, height: 0.37, offset: 2.8, foot: [100, 129, 255], middle: [75, 100, 222], top: [146, 77, 234] },
  { base: 0.58, height: 0.44, offset: 0, foot: [130, 255, 178], middle: [41, 219, 167], top: [136, 100, 231] },
  { base: 0.47, height: 0.29, offset: 1.4, foot: [92, 198, 233], middle: [56, 135, 206], top: [122, 89, 218] },
] as const satisfies ReadonlyArray<{ base: number; height: number; offset: number; foot: Color; middle: Color; top: Color }>

const gradientSize = 256
const gradientStart = -0.28
const gradientSpan = 1.6

function makeGradient({ foot, middle, top }: typeof sheets[number], glow: number) {
  const values = new Uint8Array(gradientSize * 4)
  for (let i = 0; i < gradientSize; i++) {
    const y = gradientStart + i * gradientSpan / (gradientSize - 1)
    const t = smooth((y - 0.06) / 0.44)
    const u = smooth((y - 0.36) / 0.68)
    for (let channel = 0; channel < 3; channel++) {
      const baseColor = foot[channel] + t * (middle[channel] - foot[channel])
      values[i * 4 + channel] = baseColor + u * (top[channel] - baseColor)
    }
    // The emission peaks around the lower part of the sheet and fades on both sides.
    const falloff = Math.exp(-Math.max(y, 0) * (2.4 - glow * 0.8))
    values[i * 4 + 3] = 255 * smooth((y - gradientStart) / 0.39) * falloff * (1 - smooth((y - 0.64) / 0.68))
  }
  return values
}

export function createAuroraCurtain(canvas: HTMLCanvasElement, params: EffectParams<'ambient.aurora-curtain'>) {
  const context = canvas.getContext('2d')
  if (!context) throw Error('Aurora curtain requires a 2D surface')
  const gradients = sheets.map(sheet => makeGradient(sheet, params.glow))
  let buffer: ImageData | undefined

  function paint(width: number, height: number, layers: number, phase: number) {
    if (!buffer || buffer.width !== width || buffer.height !== height) {
      canvas.width = width
      canvas.height = height
      buffer = context!.createImageData(width, height)
    }
    const pixels = buffer.data
    pixels.fill(0)

    // Each sheet is an emissive field. A smooth envelope and correlated folds
    // change the height and transmitted light of each column together.
    for (let layer = 0; layer < layers; layer++) {
      const { base, height: rise, offset } = sheets[layer]
      const gradient = gradients[layer]
      const weight = layer === 1 ? 0.88 : (0.2 + params.depth * 0.65) * (layer === 0 ? 0.62 : 0.37)
      const span = 0.59 + params.curtainWidth * 0.45
      const slide = 0.024 * Math.sin(phase + offset)
      for (let x = 0; x < width; x++) {
        const u = (x / (width - 1) - 0.5 - slide) / span + 0.5
        const envelope = smooth(u / 0.13) * smooth((1 - u) / 0.17)
        if (envelope === 0) continue
        const s = u * cycle
        const fold = Math.sin(23 * s - phase * 3 + 1.2 * Math.sin(3 * s + offset))
          + 0.48 * Math.sin(38.4 * s + phase * 2 + offset)
          + 0.31 * Math.sin(11.6 * s - phase + offset)
        const highFold = Math.sin(23 * s - phase * 3 + 0.9 + 1.2 * Math.sin(3 * s + offset))
          + 0.48 * Math.sin(38.4 * s + phase * 2 + offset + 1.7)
          + 0.31 * Math.sin(11.6 * s - phase + offset + 0.6)
        const crest = smooth(0.47 + 0.37 * fold)
        const innerCrest = smooth(0.47 + 0.37 * highFold)
        const arcs = Math.sin(s - phase + offset) * 0.15 + Math.sin(2 * s + phase + offset + 0.65) * 0.085
        const bottom = base + envelope * (arcs + 0.033 * params.foldAmplitude * Math.sin(3 * s - 2 * phase))
        const focal = (u - 0.63 - 0.06 * Math.sin(phase + offset)) / 0.22
        const bloom = 0.60 + 0.34 * Math.exp(-focal * focal) + 0.11 * Math.sin(2 * s + phase + offset)
        const riseAtColumn = rise * (0.48 + 0.52 * envelope)
        const above = riseAtColumn * (0.62 + 0.24 * bloom + 0.36 * crest * params.foldAmplitude)
        const below = riseAtColumn * 0.63
        const emission = envelope * weight * bloom
        const first = Math.max(0, Math.ceil((bottom - above * (gradientSpan + gradientStart)) * height))
        const last = Math.min(height - 1, Math.floor((bottom - below * gradientStart) * height))

        for (let y = first; y <= last; y++) {
          const altitude = bottom - y / height
          const distance = altitude / (altitude < 0 ? below : above)
          const sample = Math.min(gradientSize - 1, Math.max(0,
            Math.round((distance - gradientStart) * (gradientSize - 1) / gradientSpan))) * 4
          const taper = smooth(distance)
          const foldLight = crest + (innerCrest - crest) * taper
          // Near the foot, the sheet stays continuous. The folds become
          // more pronounced as the glow thins upward.
          const definition = smooth((distance + 0.05) / 0.46) * params.foldAmplitude
          const light = 0.72 + (foldLight - 0.5) * (0.17 + 1.13 * definition)
          const alpha = Math.min(1, gradient[sample + 3] / 255 * emission * light)
          if (alpha <= 0.002) continue
          const index = (y * width + x) * 4
          const underneath = pixels[index + 3] / 255 * (1 - alpha)
          const combined = alpha + underneath
          for (let channel = 0; channel < 3; channel++) {
            pixels[index + channel] = (gradient[sample + channel] * alpha + pixels[index + channel] * underneath) / combined
          }
          pixels[index + 3] = combined * 255
        }
      }
    }
    context!.putImageData(buffer, 0, 0)
  }

  return paint
}
