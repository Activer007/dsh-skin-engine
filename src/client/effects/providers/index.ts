import type { effectDefinitions } from '../../../core/effects.js'
import { ambientLight } from './ambient-light.js'
import { bubbles, dust, ripple, stars } from './canvas-effects.js'
import type { RegisteredProvider } from './contract.js'
import { aurora, brightness, flow, glass, holographic, refraction } from './materials.js'
import { createProviderRegistry } from './runtime.js'

// Registration order controls composition within the scene's managed surfaces.
const providers = { refraction, aurora, glass, holographic, flow, ambientLight, brightness, dust, bubbles, stars, ripple } satisfies {
  [Name in keyof typeof effectDefinitions]: RegisteredProvider<(typeof effectDefinitions)[Name]['id']>
}

export const effectProviders = createProviderRegistry(Object.values(providers))
