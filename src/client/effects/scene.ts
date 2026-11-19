import { auditedSurfaceStyles } from '../../adapter/surface-map.js'
import type { SkinEffect } from '../../core/effects.js'
import type { Quality } from '../../shared/preferences.js'
import type { PreparedArtwork } from '../../shared/skins.js'
import { mountArtwork } from '../scene/artwork.js'
import type { ScenePreset } from '../scene/presets.js'
import { mountCanvas } from './canvas.js'
import type { createFrameScheduler } from './frame-scheduler.js'
import type { EffectLayout, EffectMode, EffectPlacement, RefractionStatus } from './providers/contract.js'
import { effectProviders } from './providers/index.js'
import { effectQuality } from './quality.js'
import { observeEffectSurfaces } from './surfaces.js'

export type { EffectMode, RefractionStatus } from './providers/contract.js'

declare const CSS_EFFECTS_STYLES: string

const SCENE = 'data-dsh-skin-effect-scene'
const LAYER = 'data-dsh-skin-effect-layer'
const PAUSED = 'data-dsh-skin-paused'
const INTERACTION_SETTLE_MS = 300

export function mountEffectScene(document: Document, effects: readonly SkinEffect[], accent: string, initialMode: EffectMode,
  initialQuality: Quality, scheduler: ReturnType<typeof createFrameScheduler>, reportRefraction: (status: RefractionStatus) => void,
  artwork?: PreparedArtwork, preset?: ScenePreset, initialSidebarEffects = false) {
  if (!artwork && !effects.some(effect => effect.enabled)) return
  const view = document.defaultView!
  const transparency = view.matchMedia('(prefers-reduced-transparency: reduce)')
  const forcedColors = view.matchMedia('(forced-colors: active)')
  const sceneArtwork = artwork?.kind === 'scene'
  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)')
  const filterSupported = view.CSS.supports('color', 'color-mix(in srgb, black, transparent)')
    && (view.CSS.supports('backdrop-filter', 'blur(1px)') || view.CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))
  const style = document.createElement('style')
  style.setAttribute('data-dsh-skin-effects-style', '')
  style.textContent = auditedSurfaceStyles.composerBackdrop + CSS_EFFECTS_STYLES
  const scene = document.createElement('div')
  scene.setAttribute('aria-hidden', 'true')
  if (artwork?.kind === 'legacy'
    && effects.some(effect => effect.id === 'ambient.light' && effect.params.illuminateArtwork && !effect.enabled)) {
    scene.style.setProperty('--dsh-skin-artwork-light', '0')
  }
  if (preset) scene.setAttribute('data-dsh-skin-scene-preset', preset)
  scene.hidden = true
  const sidebarLayers = new Set<HTMLElement>()
  const cssLayers = new Set<HTMLElement>()
  let glassLayer: ReturnType<typeof layer> | undefined
  const glassClaims = new Set<{ material: boolean; visible: boolean }>()
  let mode = initialMode
  let quality = initialQuality
  let sidebarEffects = initialSidebarEffects
  let extensionGlass: ReturnType<typeof sidebarGlass> | undefined
  let layout: EffectLayout
  let art: ReturnType<typeof mountArtwork> | undefined
  let canvas: ReturnType<typeof mountCanvas>
  let canvasUnavailable = false
  let providers: ReturnType<typeof effectProviders.mount> = []
  let conversationSurface: Element | undefined
  let sidebarSurface: Element | undefined
  let visible = false
  let dynamic = false
  let p1Motion = false
  let cssAnimating = false
  let interactionTimer: number | undefined
  let reconcileQueued = false
  let disposed = false

  function layer(kind: string, placement: EffectPlacement = 'scene', cssMotion = false) {
    const node = document.createElement('div')
    node.setAttribute(LAYER, kind)
    node.setAttribute('aria-hidden', 'true')
    if (placement === 'scene') scene.append(node)
    else if (placement === 'under-artwork') scene.prepend(node)
    else if (placement === 'sidebar') {
      node.hidden = true
      sidebarLayers.add(node)
    } else placement.append(node)
    if (cssMotion) cssLayers.add(node)
    return {
      node,
      release() {
        sidebarLayers.delete(node)
        cssLayers.delete(node)
        node.remove()
      },
    }
  }

  function sidebarGlass(material: boolean) {
    const shared = glassLayer ??= layer('glass', 'sidebar')
    const claim = { material, visible: false }
    glassClaims.add(claim)
    function sync() {
      const claims = [...glassClaims]
      shared.node.hidden = !claims.some(claim => claim.visible)
      shared.node.toggleAttribute('data-dsh-skin-glass-fallback', !claims.some(claim => claim.visible && claim.material))
    }
    return {
      node: shared.node,
      show(visible: boolean) { claim.visible = visible; sync() },
      release() {
        glassClaims.delete(claim)
        if (glassClaims.size) sync()
        else { shared.release(); glassLayer = undefined }
      },
    }
  }

  function requestReconcile() {
    if (reconcileQueued || disposed) return
    reconcileQueued = true
    queueMicrotask(() => { reconcileQueued = false; reconcile() })
  }

  function syncCanvas() {
    canvas?.configure(effectQuality[layout.quality], visible && providers.some(provider => provider.drawsCanvas()),
      dynamic && providers.some(provider => provider.animatesCanvas()))
  }

  function updateCssPlayback() {
    const paused = document.visibilityState !== 'visible' || interactionTimer !== undefined
    scene.toggleAttribute(PAUSED, paused)
    for (const node of cssLayers) node.toggleAttribute(PAUSED, paused)
    scheduler.trackCss(cssAnimating && !paused)
  }

  function deferCssMotion(event: Event) {
    if (!event.isTrusted || !cssAnimating) return
    const alreadyPaused = interactionTimer !== undefined
    view.clearTimeout(interactionTimer)
    interactionTimer = view.setTimeout(() => {
      interactionTimer = undefined
      updateCssPlayback()
    }, INTERACTION_SETTLE_MS)
    if (!alreadyPaused) updateCssPlayback()
  }

  function playback() {
    if (disposed) return
    const wasMotion = p1Motion
    const wasVisible = visible
    visible = document.visibilityState === 'visible' && !scene.hidden && mode !== 'off'
    dynamic = visible && mode === 'dynamic' && !reducedMotion.matches
    const budget = effectQuality[layout.quality]
    p1Motion = dynamic && budget.p1Motion
    cssAnimating = dynamic && providers.some(provider => provider.cssAnimating)
    if (!cssAnimating) {
      view.clearTimeout(interactionTimer)
      interactionTimer = undefined
    }
    scheduler.configure(budget.fps, !dynamic)
    updateCssPlayback()
    const state = { ...layout, visible, dynamic, p1Motion,
      conversationInput: canvas ? conversationSurface : undefined, sidebarInput: sidebarSurface }
    const redraw = providers.map(provider => provider.update(state)).some(Boolean)
    art?.configureMotion?.(p1Motion && preset !== 'static' ? conversationSurface : undefined, preset === 'dynamic')
    syncCanvas()
    if (wasVisible && visible && (wasMotion !== p1Motion || redraw)) canvas?.redraw()
  }

  function reconcile() {
    if (disposed) return
    const extendSidebar = sidebarEffects && effects.some(effect => effect.enabled) && mode !== 'off' && mode !== 'economy'
      && !transparency.matches && !forcedColors.matches
      && view.CSS.supports('color', 'color-mix(in srgb, black, transparent)')
    if (extendSidebar && !extensionGlass) extensionGlass = sidebarGlass(false)
    if (!extendSidebar && extensionGlass) { extensionGlass.release(); extensionGlass = undefined }
    const hosts = surfaces.locate(mode !== 'off' && sidebarLayers.size > 0, sceneArtwork, extendSidebar)
    const { frame, conversation, sidebar, conversationContent, composer, canvas: surface, sidebarGrid } = hosts
    layout = { mode, quality: mode === 'economy' ? 'low' : quality, canvas: mode !== 'off' && surface, sidebarGrid,
      filterSupported, reducedTransparency: transparency.matches }
    if (providers.some(provider => provider.canvas)) {
      if (!canvas && !canvasUnavailable) {
        try {
          canvas = mountCanvas(scene, scheduler, (context, width, height, delta) => {
            for (const provider of providers) provider.draw(context, width, height, delta)
          }, syncCanvas)
        } catch { /* Providers with a Canvas contribution are degraded below. */ }
        canvasUnavailable = !canvas
      }
      if (canvasUnavailable) for (const provider of providers) provider.unavailableCanvas()
    } else if (canvas) {
      canvas.dispose()
      canvas = undefined
    }
    const providerVisible = providers.map(provider => provider.layout(layout)).some(Boolean)
    const showArtwork = art?.update(Boolean(hosts.chatCanvas && (!sceneArtwork || (!transparency.matches && !forcedColors.matches))),
      conversationContent, composer)
    const showScene = Boolean(showArtwork || (layout.canvas && (providerVisible || canvas)))
    extensionGlass?.show(sidebarGrid && showScene)
    glassLayer?.node.toggleAttribute('data-dsh-skin-sidebar-effects', extendSidebar && sidebarGrid && showScene)
    const showGlass = sidebarGrid && !!glassLayer && !glassLayer.node.hidden

    surfaces.mark(hosts, showScene, showGlass)
    scene.setAttribute(SCENE, mode)
    scene.hidden = !showScene
    conversationSurface = showScene ? conversation ?? undefined : undefined
    sidebarSurface = showGlass ? sidebar ?? undefined : undefined
    for (const node of sidebarLayers) {
      if (node.parentElement && node.parentElement !== frame) node.remove()
      if (frame && !node.hidden && node.parentElement !== frame) frame.append(node)
    }
    playback()

    if (mode !== 'off' || artwork) surfaces.watch(hosts, sceneArtwork)
  }

  const surfaces = observeEffectSurfaces(document, reconcile)
  function dispose() {
    if (disposed) return
    disposed = true
    surfaces.stopWatching()
    document.removeEventListener('visibilitychange', playback)
    document.removeEventListener('pointerdown', deferCssMotion, true)
    document.removeEventListener('keydown', deferCssMotion, true)
    view.clearTimeout(interactionTimer)
    transparency.removeEventListener('change', reconcile)
    forcedColors?.removeEventListener('change', reconcile)
    reducedMotion.removeEventListener('change', playback)
    scheduler.trackCss(false)
    canvas?.dispose()
    for (const provider of providers) provider.dispose()
    extensionGlass?.release()
    art?.dispose()
    surfaces.clearMarks()
    scene.remove()
    style.remove()
  }
  try {
    document.head.append(style)
    if (!style.sheet) {
      dispose()
      return
    }
    document.body.append(scene)
    if (artwork) art = mountArtwork(layer('artwork').node, artwork, reconcile, scheduler)
    providers = effectProviders.mount(effects, { scene, view, accent, frames: scheduler, layer, sidebarGlass, syncCanvas, reportRefraction },
      requestReconcile, (id, stage) => view.console.warn('Skin Engine effect Provider failed', id, stage))
    if (!art && !providers.some(provider => provider.mounted)) {
      dispose()
      return
    }
    document.addEventListener('visibilitychange', playback)
    if (providers.some(provider => provider.hasCssMotion)) {
      document.addEventListener('pointerdown', deferCssMotion, { capture: true, passive: true })
      document.addEventListener('keydown', deferCssMotion, { capture: true, passive: true })
    }
    transparency.addEventListener('change', reconcile)
    forcedColors?.addEventListener('change', reconcile)
    reducedMotion.addEventListener('change', playback)
    reconcile()
  } catch (error) {
    dispose()
    throw error
  }
  return {
    configure(nextMode: EffectMode, nextQuality: Quality, nextSidebarEffects = sidebarEffects) {
      mode = nextMode
      quality = nextQuality
      sidebarEffects = nextSidebarEffects
      reconcile()
    },
    dispose,
  }
}
