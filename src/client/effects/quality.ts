import type { Quality } from '../../shared/preferences.js'

export const effectQuality = {
  low: { fps: 20, dpr: 1, dust: 24, bubbles: 18, stars: 32, p1Motion: false, glassBlur: 8, auroraBlur: 24 },
  balanced: { fps: 30, dpr: 1.5, dust: 56, bubbles: 40, stars: 72, p1Motion: true, glassBlur: 18, auroraBlur: 48 },
  high: { fps: 60, dpr: 2, dust: 96, bubbles: 64, stars: 120, p1Motion: true, glassBlur: 24, auroraBlur: 96 },
} as const satisfies Record<Quality, {
  fps: number; dpr: number; dust: number; bubbles: number; stars: number; p1Motion: boolean; glassBlur: number; auroraBlur: number
}>

export type EffectBudget = (typeof effectQuality)[Quality]
