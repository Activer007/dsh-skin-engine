import { gte, minVersion } from 'semver'
import { parseSkinEffects } from './effects.js'
import { AURORA_CURTAIN_API_VERSION, DUAL_APPEARANCE_API_VERSION, parseSkinManifest } from './manifest.js'
import { parseScene } from './scene.js'
import { parseSkinTokens } from './tokens.js'
import { invalid } from './validation.js'

export function parseSkinPackage(files: { manifest: unknown; tokens: unknown; effects: unknown; scene?: unknown }) {
  const manifest = parseSkinManifest(files.manifest)
  for (const capability of ['tokens', 'css'] as const) {
    if (!manifest.capabilities.includes(capability)) {
      invalid('skin.json', 'capabilities', 'missing-capability', `Skin entries require the ${capability} capability`)
    }
  }
  const tokens = parseSkinTokens(files.tokens)
  const effects = parseSkinEffects(files.effects, manifest.capabilities)
  if (effects.effects.some(effect => effect.id === 'ambient.aurora-curtain')) {
    const minimum = minVersion(manifest.engineApi)
    if (!minimum || !gte(minimum, AURORA_CURTAIN_API_VERSION)) {
      invalid('skin.json', 'engineApi', 'aurora-curtain-engine-api', 'Aurora Curtain requires Engine API 1.8.0 or later')
    }
  }
  if (!manifest.entry.scene && files.scene !== undefined) {
    invalid('scene.json', '', 'undeclared-scene', 'Scene data requires entry.scene in skin.json')
  }
  const scene = manifest.entry.scene ? parseScene(files.scene, manifest, effects.effects) : undefined
  if (tokens.variants || scene?.layout.artwork.variants) {
    if (manifest.colorScheme !== 'both') {
      invalid('skin.json', 'colorScheme', 'dual-appearance-scheme', 'Appearance variants require colorScheme: both')
    }
    const minimum = minVersion(manifest.engineApi)
    if (!minimum || !gte(minimum, DUAL_APPEARANCE_API_VERSION)) {
      invalid('skin.json', 'engineApi', 'dual-appearance-engine-api', `Appearance variants require Engine API ${DUAL_APPEARANCE_API_VERSION} or later`)
    }
  }
  if (tokens.variants) {
    for (const key of ['canvas', 'surface'] as const) {
      if (tokens.colors[key]) continue
      const light = tokens.variants.light?.[key]
      const dark = tokens.variants.dark?.[key]
      if (Boolean(light) !== Boolean(dark)) {
        invalid('tokens.json', `variants.${light ? 'dark' : 'light'}.${key}`, 'incomplete-surface-pair',
          `Supply a base ${key} color or define it in both variants for the host override`)
      }
    }
  }
  return { manifest, tokens, ...effects, ...(scene && { scene }) }
}
