import { effectQuality } from './quality.js'

const PRESSURE_WINDOW = 24
const MISSES_TO_DROP = 8
const RECOVERY_WINDOW = 80
const RECOVERY_MISSES = 8

export function createAutoQuality() {
  let tier: 'balanced' | 'low' = 'balanced'
  let samples = 0
  let misses = 0

  function resetSamples() { samples = misses = 0 }

  return {
    get: () => tier,
    resetSamples,
    reset() { tier = 'balanced'; resetSamples() },
    sample(intervalMs: number, workMs: number) {
      const target = 1000 / effectQuality[tier].fps
      if (tier === 'balanced') {
        samples++
        if (intervalMs > target + 12 || workMs > 8) misses++
        if (samples === PRESSURE_WINDOW) {
          if (misses >= MISSES_TO_DROP) tier = 'low'
          resetSamples()
        }
      } else if (workMs > 4 || intervalMs > 100) {
        resetSamples()
      } else {
        samples++
        if (intervalMs > target + 20) misses++
        if (samples === RECOVERY_WINDOW) {
          if (misses <= RECOVERY_MISSES) tier = 'balanced'
          resetSamples()
        }
      }
      return tier
    },
  }
}
