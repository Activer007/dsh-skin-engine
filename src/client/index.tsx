import { createAppearanceSession } from './appearance-session.js'
import { ChatPreviewBar, createChatPreview, type PreviewLayout } from './chat-preview.js'
import { createPackageOperations } from './package-operations.js'
import { registerAppearanceNavigation, type AppearanceSlots } from './appearance-navigation.js'
import { observeAppearance } from '../adapter/coexistence.js'
import { createSkinTheme, SKIN_ATTRIBUTE, type ThemeService } from '../adapter/skin-theme.js'
import type { PreparedArtwork } from '../shared/skins.js'
import { createEffectsRuntime } from './effects/p0.js'
import { SETTINGS_LOCALE, settingsCopy, type TranslateSettings } from './settings-copy.js'
import { createSettingsSession } from './settings-session.js'
import { skinApi, type SkinData } from './skin-api.js'
import { SkinPanel } from './skin-panel.js'
import { createSkinSwitch } from './skin-switch.js'

export { createSkinSwitch, createSkinTheme }

const SECTION = 'settings.section'

interface ClientContext {
  effect(setup: () => () => void, label: string): unknown
  on(event: 'theme/change', listener: () => void): unknown
  get?(key: 'locale'): {
    bind(namespace: string): TranslateSettings
    register(namespace: string, copy: typeof settingsCopy): () => void
  } | undefined
  slots: AppearanceSlots
  layout: PreviewLayout
  theme: ThemeService
}

export const inject = ['slots', 'theme', 'layout', 'locale']

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
  const appearanceSession = createAppearanceSession()
  const packageOperations = createPackageOperations(controller)
  const preview = ctx.layout?.panelInfo ? createChatPreview(ctx.layout, controller, appearanceSession, packageOperations) : undefined
  const settingsSession = createSettingsSession(document, () => {
    if (!preview?.getSnapshot().request) void controller.cancelPreview()
  })
  const observer = new MutationObserver(controller.appearanceChanged)
  const refreshOnFocus = () => {
    const state = controller.getSnapshot()
    if (!state.preview && !state.pending) void controller.refresh(true)
  }
  ctx.effect(() => () => {
    preview?.dispose()
    packageOperations.dispose()
    appearanceSession.clear()
    settingsSession.clear()
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

  // Locale belongs to the plugin, not to the lifetime of the settings slot.
  const locale = ctx.get?.('locale')
  if (locale) ctx.effect(() => locale.register(SETTINGS_LOCALE, settingsCopy), 'skin-engine: settings locale')
  registerAppearanceNavigation(ctx, locale?.bind(SETTINGS_LOCALE), {
    controller, effects, getColorScheme, settingsSession: appearanceSession, packageOperations, chatPreview: preview?.start,
  })
  if (preview) ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'dsh-skin-engine.chat-preview', locale: SETTINGS_LOCALE,
    inject: () => ({ preview, controller }),
  }, ChatPreviewBar))

  ctx.slots.inject(SECTION, () => {
    ctx.slots.register({
      name: SECTION, id: 'dsh-skin-engine', order: 125,
      label: locale ? () => locale.bind(SETTINGS_LOCALE)('title') : 'Skin Engine',
      ...(locale && { locale: SETTINGS_LOCALE }),
      inject: () => ({ controller, effects, getColorScheme, settingsSession, packageOperations }),
    }, SkinPanel)
  })
  void controller.refresh()
}
