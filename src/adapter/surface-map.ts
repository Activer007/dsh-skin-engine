import { SUPPORTED_DSH_VERSION } from '../shared/compatibility.js'

/** Token and layout carriers verified in official DSH 0.2.2-rc.1. */
export const auditedSurfaceMap = {
  host: SUPPORTED_DSH_VERSION,
  surfaces: {
    'app.canvas': {
      anchor: 'body',
      carrier: 'self',
      token: '--dsw-alias-bg-base',
    },
    'app.sidebar': {
      anchor: '[data-slot="sidebar"]',
      carrier: 'parent',
      token: '--dsw-specific-sidebar-fill',
    },
  },
  preserve: ['app.editor', 'app.dialog', 'app.menu', 'app.topbar', 'app.inspector'],
} as const

export const auditedSurfaceStyles = {
  // The settings panel is portalled beside the root. The width follows the mounted section.
  settings: `
@media (min-width: 900px) {
  body > [role="presentation"] > [role="dialog"][aria-modal="true"][data-shortcut-modal="settings"]:has([data-dsh-skin-engine]) {
    width: 1120px;
  }
}`,
  // The native composer card owns the fill. The editor, attachments, and menus retain their styles.
  composer: `
@media (prefers-reduced-transparency: no-preference) and (forced-colors: none) {
  html:is([data-dsh-skin-id="com.dsh.skin.deep-ocean"], [data-dsh-skin-id="com.dsh.skin.deep-ocean.sample"])
    [data-slot="main"] > [data-slot="main.conversation"] > [data-phase]
    > [data-conversation-content][data-conversation-region="chat"]
    [data-composer-seat][data-conversation-region="composer"] [data-composer-card]:has([data-composer-input]) {
    background-color: color-mix(in srgb, var(--dsw-specific-input-major) 82%, transparent);
  }
}`,
} as const

/** The expanded sidebar fills the first cell of the positioned host grid. */
export function hasAuditedSidebarTrack(frame: CSSStyleDeclaration, sidebar: CSSStyleDeclaration) {
  return frame.position === 'relative' && sidebar.gridColumnStart === '1' && sidebar.gridRowStart === '1'
    && ['auto', '2'].includes(sidebar.gridColumnEnd) && ['auto', '2'].includes(sidebar.gridRowEnd)
}

/** Layout carriers verified on the Web and Windows app for this host version. */
export function resolveEffectSurfaces(document: Document) {
  const view = document.defaultView!
  const root = document.querySelector('body > #root')
  const rootSlot = root?.querySelector(':scope > [data-slot="root"]')
  const slots = rootSlot?.querySelectorAll(auditedSurfaceMap.surfaces['app.sidebar'].anchor)
  const sidebarSlot = slots?.length === 1 ? slots[0] : undefined
  const sidebar = sidebarSlot?.parentElement
  const frame = sidebar?.parentElement
  if (!frame || frame.parentElement !== rootSlot || view.getComputedStyle(frame).display !== 'grid') {
    return { root, rootSlot }
  }
  const centers = Array.from(frame.children).filter(child => {
    const style = view.getComputedStyle(child)
    return style.gridColumnStart === '2' && style.gridRowStart === '1' && style.display === 'flex'
  })
  const center = centers.length === 1 ? centers[0] : undefined
  const main = center?.childElementCount === 1 ? center.firstElementChild : undefined
  const mainSlot = main?.querySelector(':scope > [data-slot="main"]')
  const conversationSlot = mainSlot?.querySelector(':scope > [data-slot="main.conversation"]')
  const content = main?.hasAttribute('data-global-panel') ? undefined
    : conversationSlot?.querySelectorAll(':scope > [data-phase] > [data-conversation-content][data-conversation-region="chat"]')
  const conversation = content?.length === 1 ? content[0].parentElement : undefined
  return {
    root, rootSlot, frame, center, main, mainSlot, conversationSlot, conversation, sidebar, sidebarSlot,
    sidebarContent: sidebarSlot?.children.length === 1 ? sidebarSlot.firstElementChild : undefined,
  }
}
