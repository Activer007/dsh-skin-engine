import { parseSkinEffects } from './effects.js'
import { parseSkinManifest } from './manifest.js'
import { parseSkinTokens } from './tokens.js'
import { invalid } from './validation.js'

export function parseSkinPackage(files: { manifest: unknown; tokens: unknown; effects: unknown }) {
  const manifest = parseSkinManifest(files.manifest)
  for (const capability of ['tokens', 'css'] as const) {
    if (!manifest.capabilities.includes(capability)) {
      invalid('skin.json', 'capabilities', 'missing-capability', `Skin entries require the ${capability} capability`)
    }
  }
  const tokens = parseSkinTokens(files.tokens)
  return { manifest, tokens, ...parseSkinEffects(files.effects, manifest.capabilities) }
}
