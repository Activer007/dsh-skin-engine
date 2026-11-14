import type { ComponentType } from 'react'
import { SkinWorkspace, type WorkspaceProps } from './skin-workspace.js'
import { fallbackSettingsCopy, SETTINGS_LOCALE, type TranslateSettings } from './settings-copy.js'

export const APPEARANCE_PANEL = 'dsh-skin-appearance'

/** Structural subset of the official rc.1 Slots service. main uses key, lists use id. */
export interface AppearanceSlots {
  inject(slot: string, register: () => unknown): unknown
  register<Props>(options: {
    name: string
    key?: string
    id?: string
    order?: number
    label?: string | (() => string)
    locale?: string
    inject?: () => Props
  }, component: ComponentType<Props>): unknown
}

interface AppearanceProps extends WorkspaceProps { backToChat(): void }

/** Main owns UI drafts independently of the settings dialog. */
export function AppearancePanel(props: AppearanceProps) {
  return <section data-dsh-skin-appearance="" style={{ minWidth: 0, overflow: 'auto', height: '100%' }}>
    <SkinWorkspace {...props} />
  </section>
}

/** The native sidebar supplies the button, accessible name, pinning and focus. */
export function AppearanceIcon({ size, active }: { size: number; active: boolean }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={active ? 2 : 1.5} aria-hidden="true" focusable="false">
    <path d="M12 3a9 9 0 1 0 0 18h1.2a2.3 2.3 0 0 0 1.4-4.1 1.4 1.4 0 0 1 .9-2.5H18a3 3 0 0 0 3-3C21 6.8 17 3 12 3Z" />
    <circle cx="7.5" cy="11" r=".8" /><circle cx="10" cy="7.5" r=".8" />
    <circle cx="14.5" cy="7.5" r=".8" /><circle cx="17" cy="10.5" r=".8" />
  </svg>
}

export function registerAppearanceNavigation(ctx: {
  slots: AppearanceSlots
  layout: { selectPanel(panel: null): void }
}, translate: TranslateSettings | undefined, workspace: Omit<WorkspaceProps, 'backToChat' | 't'>): void {
  const t = translate ?? ((...args: Parameters<TranslateSettings>) => fallbackSettingsCopy(document.documentElement.lang)(...args))
  // Return registration handles so the official scope owns disposal on unload.
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: APPEARANCE_PANEL, locale: SETTINGS_LOCALE,
    inject: () => ({ ...workspace, backToChat: () => ctx.layout.selectPanel(null) }),
  }, AppearancePanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: APPEARANCE_PANEL, order: 125,
    label: () => t('appearanceCenter'), locale: SETTINGS_LOCALE,
  }, AppearanceIcon))
}
