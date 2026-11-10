import type { SkinChoice, SkinData } from '../client/skin-api.js'
import type { ColorScheme } from '../core/tokens.js'
import { resolveSkinColors, type SkinPreferences } from '../shared/preferences.js'
import { appearanceConflict } from './coexistence.js'
import { auditedSurfaceMap } from './surface-map.js'

type TokenOverrides = Record<string, Record<ColorScheme, string>>

export interface ThemeService {
  getTheme(): { preference: string; active: { colorScheme: ColorScheme }; themes: readonly { id: string }[] }
  setTheme(id: string): void
  overrideTokens(source: string, tokens: TokenOverrides): () => void
}

export const SKIN_ATTRIBUTE = 'data-dsh-skin-id'
const SOURCE = 'dsh-plugin-skin-engine'

export function createSkinTheme(theme: ThemeService, document: Document) {
  const root = document.documentElement
  let owner: { id: string } | undefined

  function blockReason(choice: SkinChoice, intent: 'render' | 'apply' = 'render'): string | undefined {
    const conflict = appearanceConflict(document)
    if (conflict) return conflict
    const marker = root.getAttribute(SKIN_ATTRIBUTE)
    if (marker !== null && marker !== owner?.id) return 'Another skin owns the appearance.'
    const scheme = choice.manifest.colorScheme
    if (intent === 'render' && scheme && scheme !== 'both' && scheme !== theme.getTheme().active.colorScheme) {
      const option = scheme === 'dark' ? 'Dark' : 'Light'
      return `${choice.manifest.name} requires ${scheme} appearance. Select ${option} in Settings → General.`
    }
  }

  function switchAppearance(choice: SkinChoice): (() => void) | undefined {
    const scheme = choice.manifest.colorScheme
    const previous = theme.getTheme()
    if (!scheme || scheme === 'both' || scheme === previous.active.colorScheme) return
    theme.setTheme(scheme)
    return () => {
      const current = theme.getTheme()
      if (current.preference !== scheme) return
      const original = previous.preference
      theme.setTheme(original === 'system' || current.themes.some(item => item.id === original) ? original : 'system')
    }
  }

  function mount(data: SkinData, colors?: SkinPreferences['colors']): () => void {
    if (root.hasAttribute(SKIN_ATTRIBUTE)) throw new Error('The skin scope is occupied.')
    const activation = { id: data.manifest.id }
    const tokens: TokenOverrides = {}
    const light = { ...resolveSkinColors(data.tokens, 'light'), ...colors }
    const dark = { ...resolveSkinColors(data.tokens, 'dark'), ...colors }
    if (light.canvas && dark.canvas) tokens[auditedSurfaceMap.surfaces['app.canvas'].token] = { light: light.canvas, dark: dark.canvas }
    if (light.surface && dark.surface) tokens[auditedSurfaceMap.surfaces['app.sidebar'].token] = { light: light.surface, dark: dark.surface }
    owner = activation
    let releaseTokens: (() => void) | undefined
    function release() {
      if (owner !== activation) return
      owner = undefined
      try { releaseTokens?.() } finally {
        if (root.getAttribute(SKIN_ATTRIBUTE) === activation.id) root.removeAttribute(SKIN_ATTRIBUTE)
      }
    }
    try {
      root.setAttribute(SKIN_ATTRIBUTE, activation.id)
      releaseTokens = theme.overrideTokens(SOURCE, tokens)
      return release
    } catch (error) {
      release()
      throw error
    }
  }

  return { blockReason, switchAppearance, mount }
}
