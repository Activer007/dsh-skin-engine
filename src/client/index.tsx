import type { ComponentType } from 'react'
import { observeAppearance } from '../adapter/coexistence.js'
import { createSkinTheme, SKIN_ATTRIBUTE, type ThemeService } from '../adapter/skin-theme.js'
import { createEffectsRuntime } from './effects/p0.js'
import { skinApi } from './skin-api.js'
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
  const controller = createSkinSwitch({
    api: skinApi,
    blockReason: theme.blockReason,
    switchAppearance: theme.switchAppearance,
    mount(data, preferences, artwork) {
      const releaseTheme = theme.mount(data)
      try {
        const releaseEffects = effects.mount(data.effects, data.tokens.colors.accent, preferences?.quality, artwork)
        return () => { try { releaseEffects() } finally { releaseTheme() } }
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

  let scheme = ctx.theme.getTheme().active.colorScheme
  ctx.on('theme/change', () => {
    const next = ctx.theme.getTheme().active.colorScheme
    if (next === scheme) return
    scheme = next
    // Token overrides emit theme/change synchronously. Let the host finish
    // presenting this snapshot before the controller publishes a new one.
    queueMicrotask(controller.appearanceChanged)
  })

  ctx.slots.inject(SECTION, () => {
    ctx.slots.register({
      name: SECTION, id: 'dsh-skin-engine', order: 125, label: 'Skin Engine',
      inject: () => ({ controller, effects, getColorScheme: () => ctx.theme.getTheme().active.colorScheme }),
    }, SkinPanel)
  })
  void controller.refresh()
}
