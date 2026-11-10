import type { ComponentType } from 'react'
import { observeAppearance } from '../adapter/coexistence.js'
import { createSkinTheme, SKIN_ATTRIBUTE, type ThemeService } from '../adapter/skin-theme.js'
import type { PreparedArtwork } from '../shared/skins.js'
import { createEffectsRuntime } from './effects/p0.js'
import { skinApi, type SkinData } from './skin-api.js'
import { SkinPanel, type PanelProps } from './skin-panel.js'
import { createSkinSwitch } from './skin-switch.js'

export { createSkinSwitch, createSkinTheme }

const SECTION = 'settings.section'

interface ClientContext {
  effect(setup: () => () => void, label: string): unknown
  on(event: 'theme/change', listener: () => void): unknown
  slots: {
    inject(slot: string, register: () => void): unknown
    register(options: {
      name: string
      id: string
      order: number
      label: string
      inject: () => PanelProps
    }, component: ComponentType<PanelProps>): unknown
  }
  theme: ThemeService
}

export const inject = ['slots', 'theme']

export function apply(ctx: ClientContext): void {
  const theme = createSkinTheme(ctx.theme, document)
  const effects = createEffectsRuntime(document)
  const getColorScheme = () => ctx.theme.getTheme().active.colorScheme
  const controller = createSkinSwitch({
    api: skinApi,
    getColorScheme,
    blockReason: theme.blockReason,
    switchAppearance: theme.switchAppearance,
    mount({ data: original, preferences }, data, artwork) {
      const releaseTheme = theme.mount(original, preferences?.colors)
      let releaseEffects: (() => void) | undefined
      let appearance: { artwork?: PreparedArtwork; accent?: string } | undefined
      function update(data: SkinData, artwork?: PreparedArtwork) {
        const accent = data.tokens.colors.accent
        if (appearance && appearance.accent === accent && appearance.artwork === artwork) return
        releaseEffects = effects.mount(data.effects, accent, preferences?.quality, artwork, data.scene?.presets)
        appearance = { artwork, accent }
      }
      try {
        update(data, artwork)
        return { update, release() { try { releaseEffects?.() } finally { releaseTheme() } } }
      } catch (error) {
        releaseTheme()
        throw error
      }
    },
  })
  const observer = new MutationObserver(controller.appearanceChanged)
  const refreshOnFocus = () => {
    const state = controller.getSnapshot()
    if (!state.preview && !state.pending) void controller.refresh(true)
  }
  ctx.effect(() => () => {
    observer.disconnect()
    window.removeEventListener('focus', refreshOnFocus)
    controller.dispose()
  }, 'skin-engine: release appearance and cancel pending work')
  observeAppearance(document, observer, SKIN_ATTRIBUTE)
  window.addEventListener('focus', refreshOnFocus)

  let scheme = getColorScheme()
  ctx.on('theme/change', () => {
    const next = getColorScheme()
    if (next === scheme) return
    scheme = next
    // Token overrides emit theme/change synchronously. Let the host finish
    // presenting this snapshot before the controller publishes a new one.
    queueMicrotask(controller.appearanceChanged)
  })

  ctx.slots.inject(SECTION, () => {
    ctx.slots.register({
      name: SECTION, id: 'dsh-skin-engine', order: 125, label: 'Skin Engine',
      inject: () => ({ controller, effects, getColorScheme }),
    }, SkinPanel)
  })
  void controller.refresh()
}
