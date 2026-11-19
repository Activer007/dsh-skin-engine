import type { EffectParams } from '../../core/effects.js'

const cycle = 2 * Math.PI
const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

function cellLight(cell: number, seed: number) {
  let bits = Math.imul(cell ^ seed, 0x27987989)
  bits = Math.imul(bits ^ (bits >>> 15), 0x85ebca6b)
  return ((bits ^ (bits >>> 13)) >>> 0) / 0xffffffff
}

function lightVariation(position: number, seed: number) {
  const cell = Math.floor(position)
  const start = cellLight(cell, seed)
  return start + (cellLight(cell + 1, seed) - start) * smooth(position - cell)
}

type Color = readonly [number, number, number]

const sheets = [
  { base: 0.43, height: 0.35, offset: 2.8, foot: [117, 139, 250], middle: [91, 117, 222], top: [166, 103, 231] },
  { base: 0.54, height: 0.44, offset: 0, foot: [129, 255, 174], middle: [56, 208, 178], top: [141, 116, 232] },
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
      const seed = 511 + layer * 861
      const drift = Math.sin(phase + offset)
      const slide = 0.031 * drift
      const streakOffset = Math.sin(2 * phase + offset) * 0.9
      for (let x = 0; x < width; x++) {
        const u = (x / (width - 1) - 0.5 - slide) / span + 0.5
        const envelope = smooth(u / 0.13) * smooth((1 - u) / 0.17)
        if (envelope === 0) continue
        const s = u * cycle
        // Warp the sampling positions at different scales so broad folds gather
        // into irregular groups, with finer wisps drifting inside them.
        const warped = u + 0.073 * Math.sin(1.55 * s + phase + offset)
          + 0.017 * Math.sin(4.4 * s - phase + offset)
        const groups = lightVariation(7.2 * warped - 0.47 * drift, seed)
        const pockets = lightVariation(16.6 * warped + 0.7 * drift, seed + 11)
        const streaks = 42 * warped - streakOffset
        const folds = lightVariation(streaks, seed + 37)
        const topFolds = lightVariation(streaks + 0.3 + 0.82 * pockets, seed + 37)
        const crest = smooth(0.73 * pockets + 0.53 * folds - 0.10)
        const innerCrest = smooth(0.62 * pockets + 0.61 * topFolds - 0.12)
        const arcs = 0.115 * Math.sin(1.13 * s - phase + offset)
          + 0.064 * Math.sin(2.34 * s + phase + offset + 0.65)
          + 0.028 * Math.sin(3.8 * s - phase + 2 * offset)
        const bottom = base + envelope * (arcs + 0.055 * params.foldAmplitude * (groups - 0.5))
        const focal = (u - 0.65 - 0.085 * drift) / 0.22
        const bloom = 0.43 + 0.31 * Math.exp(-focal * focal) + 0.33 * groups
        const riseAtColumn = rise * (0.45 + 0.55 * envelope)
        const above = riseAtColumn * (0.50 + 0.33 * groups + 0.4 * crest * params.foldAmplitude)
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
          const light = 0.75 + (foldLight - 0.5) * (0.14 + 1.20 * definition)
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
