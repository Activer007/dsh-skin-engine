import { parseSkinEffects } from './effects.js'
import { parseSkinManifest } from './manifest.js'
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
  if (!manifest.entry.scene && files.scene !== undefined) {
    invalid('scene.json', '', 'undeclared-scene', 'Scene data requires entry.scene in skin.json')
  }
  const scene = manifest.entry.scene ? parseScene(files.scene, manifest, effects.effects) : undefined
  return { manifest, tokens, ...effects, ...(scene && { scene }) }
}
