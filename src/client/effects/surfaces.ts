import { hasAuditedSidebarTrack, resolveArtworkComposer, resolveEffectSurfaces } from '../../adapter/surface-map.js'

const SURFACE = 'data-dsh-skin-effect-surface'

function preservesBackdrop(style: CSSStyleDeclaration) {
  return style.isolation === 'auto' && style.zIndex === 'auto' && style.opacity === '1'
    && style.transform === 'none' && style.filter === 'none'
    && (!style.backdropFilter || style.backdropFilter === 'none') && style.contain === 'none'
}

export function observeEffectSurfaces(document: Document, reconcile: () => void) {
  const view = document.defaultView!
  const observer = new view.MutationObserver(reconcile)
  const marks = new Map<Element, string>()

  function canMark(element: Element) {
    const value = element.getAttribute(SURFACE)
    return value === null || value === marks.get(element)
  }

  function hasNativeCanvas() {
    const root = view.getComputedStyle(document.documentElement)
    const body = view.getComputedStyle(document.body)
    return root.backgroundColor === 'rgba(0, 0, 0, 0)' && root.backgroundImage === 'none'
      && preservesBackdrop(root) && preservesBackdrop(body)
  }

  function canPlaceSidebarLayers(root: Element, rootSlot: Element, frame: Element, sidebar: Element, content: Element) {
    const frameStyle = view.getComputedStyle(frame)
    const sidebarStyle = view.getComputedStyle(sidebar)
    return hasAuditedSidebarTrack(frameStyle, sidebarStyle)
      && preservesBackdrop(frameStyle) && preservesBackdrop(sidebarStyle)
      && [root, rootSlot].every(element => {
        const style = view.getComputedStyle(element)
        return style.position !== 'fixed' && style.position !== 'sticky' && preservesBackdrop(style)
      })
      && canMark(sidebar) && canMark(content) && sidebarStyle.backgroundImage === 'none'
      && view.getComputedStyle(content).backgroundImage === 'none'
  }

  function locate(wantsSidebar: boolean, sceneArtwork: boolean, extendSidebar = false) {
    observer.disconnect()
    const hosts = resolveEffectSurfaces(document)
    const { root, rootSlot, frame, center, conversation, sidebar, sidebarContent } = hosts
    const chatCanvas = !!(frame && center && conversation && hasNativeCanvas()
      && [frame, center, conversation].every(element => canMark(element) && view.getComputedStyle(element).backgroundImage === 'none'))
    // Global panels keep their own backgrounds. Only the audited frame and sidebar
    // are opened to the existing scene; editors, dialogs and menus are untouched.
    const sidebarCanvas = !!(extendSidebar && frame && center && hasNativeCanvas() && canMark(frame)
      && view.getComputedStyle(frame).backgroundImage === 'none')
    const canvas = chatCanvas || sidebarCanvas
    const sidebarGrid = !!(canvas && wantsSidebar && frame && root && rootSlot && sidebar && sidebarContent
      && !frame.hasAttribute('data-sidebar-drawer') && (extendSidebar || !frame.hasAttribute('data-sidebar-collapsed'))
      && canPlaceSidebarLayers(root, rootSlot, frame, sidebar, sidebarContent))
    const composer = sceneArtwork ? resolveArtworkComposer(hosts.conversationContent) : undefined
    return { ...hosts, canvas: chatCanvas || (sidebarCanvas && sidebarGrid), chatCanvas, sidebarGrid, composer }
  }

  function setMarks(next: Map<Element, string>) {
    for (const [element, value] of marks) {
      if (!next.has(element) && element.getAttribute(SURFACE) === value) element.removeAttribute(SURFACE)
    }
    marks.clear()
    for (const [element, value] of next) {
      if (element.getAttribute(SURFACE) !== value) element.setAttribute(SURFACE, value)
      marks.set(element, value)
    }
  }

  function mark(hosts: ReturnType<typeof locate>, canvas: boolean, glass: boolean) {
    const { frame, center, conversation, sidebar, sidebarContent } = hosts
    const next = new Map<Element, string>()
    if (canvas && frame) {
      next.set(frame, 'canvas')
      if (hosts.chatCanvas && center && conversation) {
        next.set(center, 'canvas')
        next.set(conversation, 'canvas')
      }
    }
    if (glass && sidebar && sidebarContent) {
      next.set(sidebar, 'glass')
      next.set(sidebarContent, 'glass-content')
    }
    setMarks(next)
  }

  function watch(hosts: ReturnType<typeof locate>, sceneArtwork: boolean) {
    const { root, rootSlot, center, mainSlot, conversationSlot, conversation, sidebar, sidebarSlot, main, frame,
      conversationContent, composer } = hosts
    for (const parent of [document.body, root, rootSlot, center, mainSlot, conversationSlot, conversation, sidebar, sidebarSlot]) {
      if (parent) observer.observe(parent, { childList: true })
    }
    if (main) observer.observe(main, { childList: true, attributeFilter: ['data-global-panel'] })
    if (frame) observer.observe(frame, { childList: true, attributeFilter: ['data-sidebar-drawer', 'data-sidebar-collapsed'] })
    if (sceneArtwork && conversationContent) {
      observer.observe(conversationContent, { childList: true, attributeFilter: ['data-conversation-content', 'data-conversation-region'] })
      const scroll = conversationContent.querySelector(':scope > [data-conversation-scroll]')
      if (scroll) observer.observe(scroll, { childList: true })
      if (composer) observer.observe(composer, { childList: true, attributeFilter: ['data-composer-card'] })
    }
  }

  return {
    locate, mark, watch,
    stopWatching() { observer.disconnect() },
    clearMarks() { setMarks(new Map()) },
  }
}
