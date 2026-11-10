import { auditedSurfaceStyles, hasAuditedSidebarTrack, resolveEffectSurfaces } from '../../adapter/surface-map.js'
import type { SkinEffect } from '../../core/effects.js'
import type { Quality, QualityChoice } from '../../shared/preferences.js'
import type { PreparedArtwork } from '../../shared/skins.js'
import { mountAuroraPaint } from './aurora.js'
import { createAutoQuality } from './auto-quality.js'
import { mountCanvas } from './canvas.js'
import { createDust } from './dust.js'
import { createFrameScheduler } from './frame-scheduler.js'
import { createHolographic } from './holographic.js'
import { effectQuality } from './quality.js'
import { mountRefraction } from './refraction.js'
import { createRipples } from './ripple.js'
import { createStarfield } from './starfield.js'

declare const CSS_EFFECTS_STYLES: string

const SCENE = 'data-dsh-skin-effect-scene'
const LAYER = 'data-dsh-skin-effect-layer'
const SURFACE = 'data-dsh-skin-effect-surface'
const PAUSED = 'data-dsh-skin-paused'
const MOTION = 'data-dsh-skin-motion'
const INTERACTION_SETTLE_MS = 300
const INTERACTIVE = 'a, button, input, textarea, select, label, summary, [contenteditable]:not([contenteditable="false"]),'
  + ' [role="button"], [role="link"], [role="dialog"], [role="menu"], [role="menuitem"], [role="listbox"], [role="textbox"]'

export type EffectMode = 'dynamic' | 'static' | 'economy' | 'off'
type RefractionStatus = 'off' | 'css' | 'webgl'

function enabledEffect<Id extends SkinEffect['id']>(effects: readonly SkinEffect[], id: Id) {
  return effects.find((effect): effect is Extract<SkinEffect, { id: Id }> => effect.id === id && effect.enabled)
}

function setVariables(node: HTMLElement, values: Record<string, string | number>) {
  for (const [name, value] of Object.entries(values)) node.style.setProperty(`--dsh-${name}`, String(value))
}

function preservesBackdrop(style: CSSStyleDeclaration) {
  return style.isolation === 'auto' && style.zIndex === 'auto' && style.opacity === '1'
    && style.transform === 'none' && style.filter === 'none'
    && (!style.backdropFilter || style.backdropFilter === 'none') && style.contain === 'none'
}

function hasNativeCanvas(document: Document, view: Window) {
  const root = view.getComputedStyle(document.documentElement)
  const body = view.getComputedStyle(document.body)
  return root.backgroundColor === 'rgba(0, 0, 0, 0)' && root.backgroundImage === 'none'
    && preservesBackdrop(root) && preservesBackdrop(body)
}

function mountLayers(document: Document, effects: readonly SkinEffect[], accent: string, initialMode: EffectMode,
  initialQuality: Quality, scheduler: ReturnType<typeof createFrameScheduler>, reportRefraction: (status: RefractionStatus) => void,
  artwork?: PreparedArtwork) {
  const aurora = enabledEffect(effects, 'ambient.aurora')
  const flow = enabledEffect(effects, 'light.flow')
  const glass = enabledEffect(effects, 'glass.liquid')
  const dust = enabledEffect(effects, 'particles.dust')
  const starfield = enabledEffect(effects, 'particles.starfield')
  const ripple = enabledEffect(effects, 'interaction.ripple')
  const holographic = enabledEffect(effects, 'glass.holographic')
  const refraction = enabledEffect(effects, 'glass.refraction')
  const drawDust = dust && dust.params.density > 0 && dust.params.opacity > 0
    ? createDust(dust.params, accent) : undefined
  const stars = starfield && starfield.params.starCount > 0 && starfield.params.brightness > 0
    ? createStarfield(starfield.params, accent) : undefined
  const ripples = ripple ? createRipples(ripple.params) : undefined
  if (!aurora && !flow && !glass && !drawDust && !stars && !ripples && !holographic && !refraction && !artwork) return

  const view = document.defaultView!
  const transparency = view.matchMedia('(prefers-reduced-transparency: reduce)')
  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)')
  const filterSupported = view.CSS.supports('color', 'color-mix(in srgb, black, transparent)')
    && (view.CSS.supports('backdrop-filter', 'blur(1px)') || view.CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))
  const style = document.createElement('style')
  style.setAttribute('data-dsh-skin-effects-style', '')
  style.textContent = auditedSurfaceStyles.composer + CSS_EFFECTS_STYLES
  const scene = document.createElement('div')
  scene.setAttribute('aria-hidden', 'true')
  scene.hidden = true
  const sidebarLayers: HTMLElement[] = []
  const flowNodes: HTMLElement[] = []
  const marks = new Map<Element, string>()
  let mode = initialMode
  let quality = initialQuality
  let budget = effectQuality[quality]
  let auroraBlur = 0
  let auroraPaint: ReturnType<typeof mountAuroraPaint> | undefined
  let canvas: ReturnType<typeof mountCanvas>
  let refractor: ReturnType<typeof mountRefraction>
  let refractionRendering = false
  let refractionUnavailable = false
  let conversationSurface: Element | undefined
  let holographicSurface: Element | undefined
  let input: { particles?: Element; glass?: Element; release: () => void } | undefined
  let visible = false
  let dynamic = false
  let cssAnimating = false
  let interactionTimer: number | undefined
  let p1Motion = false
  let disposed = false

  function layer(kind: string, parent?: HTMLElement) {
    const node = document.createElement('div')
    node.setAttribute(LAYER, kind)
    node.setAttribute('aria-hidden', 'true')
    if (parent) parent.append(node)
    else {
      node.hidden = true
      sidebarLayers.push(node)
    }
    return node
  }

  const fallback = refraction ? layer('refraction-fallback', scene) : undefined
  fallback?.style.setProperty('--dsh-refraction-accent', accent)

  if (artwork) {
    const node = layer('artwork', scene)
    node.style.opacity = String(artwork.style.opacity)
    artwork.image.style.objectFit = artwork.style.size === 'auto' ? 'none' : artwork.style.size
    node.append(artwork.image)
  }

  const [auroraNear, auroraFar] = aurora?.params.palette === 'aurora' ? ['#37e2a7', '#7867ff'] : ['#28cbe2', '#7361ee']
  const auroraLayers = aurora ? [layer('aurora', scene), layer('aurora', scene)] : []
  if (aurora) {
    const { direction, intensity, speed } = aurora.params
    setVariables(scene, {
      'aurora-near': auroraNear, 'aurora-far': auroraFar, 'aurora-direction': `${direction}deg`,
      'aurora-intensity': intensity * 0.65, 'aurora-duration': `${20 / speed}s`,
    })
  }
  const glassNode = glass || holographic ? layer('glass') : undefined
  if (glass && glassNode) {
    const { tintAlpha, saturation, edgeLight, frost } = glass.params
    setVariables(glassNode, {
      'glass-fill': `${(0.68 + tintAlpha * 0.75 + frost * 0.06) * 100}%`,
      'glass-saturation': saturation,
      'glass-glint': 0.035 + frost * 0.09, 'glass-edge': edgeLight * 0.6,
    })
  }
  const holoNode = holographic && glassNode ? layer('holographic', glassNode) : undefined
  const holo = holographic && holoNode ? createHolographic(holoNode, holographic.params, scheduler) : undefined
  if (flow) {
    const { count, route, width, speed, intensity, colorStops } = flow.params
    for (let index = 0; index < count; index++) {
      const node = route === 'edge' ? layer('edge') : layer('flow', scene)
      if (route === 'edge') node.append(document.createElement('span'))
      setVariables(node, {
        'flow-width': `${width * (index === 0 ? 1 : 0.55)}px`, 'flow-intensity': intensity * (index === 0 ? 1 : 0.55),
        'flow-y': `${73 + index * 8}%`, 'flow-offset': `${index * (width + 3)}px`,
        'flow-duration': `${14 / speed}s`, 'flow-stops': colorStops.join(', '),
      })
      flowNodes.push(node)
    }
  }

  function canMark(element: Element) {
    const value = element.getAttribute(SURFACE)
    return value === null || value === marks.get(element)
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

  function syncCanvas() {
    const hasRipple = p1Motion && ripples?.active()
    canvas?.configure(budget, visible && Boolean(drawDust || stars || hasRipple),
      dynamic && Boolean(drawDust || hasRipple || (p1Motion && stars?.needsFrame())))
  }

  function reportRefractionLayer() {
    if (!fallback) return
    const show = visible && !transparency.matches && !disposed
    fallback.hidden = !show || refractionRendering
    reportRefraction(!show ? 'off' : refractionRendering ? 'webgl' : 'css')
  }

  function syncRefraction() {
    if (!refraction) return
    if (!dynamic || quality === 'low' || transparency.matches) {
      refractor?.dispose()
      refractor = undefined
    } else if (refractor) {
      refractor.configure(quality)
    } else if (!refractionUnavailable) {
      refractor = mountRefraction(scene, scheduler, refraction.params, accent, quality, active => {
        refractionRendering = active
        reportRefractionLayer()
      })
      refractionUnavailable = !refractor
    }
    reportRefractionLayer()
  }

  function bindInput(particles?: Element, glass?: Element) {
    if (input?.particles === particles && input?.glass === glass) return
    input?.release()
    input = undefined
    stars?.resetPointer()
    ripples?.clear()
    holo?.reset()
    if (!particles && !glass) return

    const abort = new AbortController()
    input = { particles, glass, release: () => abort.abort() }
    const passive = { passive: true, signal: abort.signal }
    if (particles && stars && starfield?.params.parallax) {
      particles.addEventListener('pointermove', event => {
        const { clientX, clientY, isPrimary, pointerType } = event as PointerEvent
        if (!isPrimary || pointerType === 'touch') return
        stars.point(clientX * 2 / Math.max(1, view.innerWidth) - 1, clientY * 2 / Math.max(1, view.innerHeight) - 1)
        syncCanvas()
      }, passive)
      const recenter = () => { stars.point(0, 0); syncCanvas() }
      particles.addEventListener('pointerleave', recenter, passive)
      particles.addEventListener('pointercancel', recenter, passive)
    }
    if (particles && ripples) {
      particles.addEventListener('click', event => {
        const { button, clientX, clientY, detail, isTrusted, target, defaultPrevented } = event as MouseEvent
        if (!isTrusted || detail === 0 || button !== 0 || defaultPrevented
          || !(target instanceof view.Element) || target.closest(INTERACTIVE) || document.getSelection()?.type === 'Range') return
        ripples.add(clientX, clientY, view.performance.now())
        syncCanvas()
      }, passive)
    }
    if (glass && holo) {
      glass.addEventListener('pointermove', event => {
        const { clientX, clientY, isPrimary, pointerType } = event as PointerEvent
        if (isPrimary && pointerType !== 'touch') holo.point(clientX, clientY)
      }, passive)
      glass.addEventListener('pointerleave', holo.reset, passive)
      glass.addEventListener('pointercancel', holo.reset, passive)
    }
  }

  function updateCssPlayback() {
    const paused = document.visibilityState !== 'visible' || interactionTimer !== undefined
    scene.toggleAttribute(PAUSED, paused)
    for (const node of flowNodes) node.toggleAttribute(PAUSED, paused)
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
    const oldInput = input
    visible = document.visibilityState === 'visible' && !scene.hidden && mode !== 'off'
    dynamic = visible && mode === 'dynamic' && !reducedMotion.matches
    p1Motion = dynamic && budget.p1Motion
    cssAnimating = dynamic && Boolean(aurora || flowNodes.some(node => !node.hidden))
    if (!cssAnimating) {
      view.clearTimeout(interactionTimer)
      interactionTimer = undefined
    }
    scheduler.configure(budget.fps, !dynamic)
    auroraPaint?.configure(dynamic ? auroraBlur : 0)
    updateCssPlayback()
    bindInput(p1Motion && canvas && (stars || ripples) ? conversationSurface : undefined,
      p1Motion && holographic?.params.pointerInfluence ? holographicSurface : undefined)
    syncCanvas()
    syncRefraction()
    if (wasVisible && visible && (wasMotion !== p1Motion || (oldInput && oldInput !== input))) canvas?.redraw()
  }

  function reconcile() {
    if (disposed) return
    observer.disconnect()
    const next = new Map<Element, string>()
    const { root, rootSlot, frame, center, main, mainSlot, conversationSlot, conversation, sidebar, sidebarContent, sidebarSlot } = resolveEffectSurfaces(document)
    const surface = frame && center && conversation && hasNativeCanvas(document, view)
      && [frame, center, conversation].every(element => canMark(element) && view.getComputedStyle(element).backgroundImage === 'none')
    const available = mode !== 'off' && surface
    const sidebarGrid = available && sidebarLayers.length > 0 && root && rootSlot && sidebar && sidebarContent
      && !frame.hasAttribute('data-sidebar-drawer') && !frame.hasAttribute('data-sidebar-collapsed')
      && canPlaceSidebarLayers(root, rootSlot, frame, sidebar, sidebarContent)
    const showGlass = Boolean(glass && sidebarGrid && filterSupported && mode !== 'economy' && !transparency.matches)
    const showHolo = Boolean(holoNode && sidebarGrid && !transparency.matches)
    const showFlow = Boolean(flow && available && mode !== 'economy' && (flow.params.route === 'background' || sidebarGrid))
    const showScene = Boolean((surface && artwork)
      || (available && (aurora || showFlow || showGlass || showHolo || canvas || (refraction && !transparency.matches))))

    if (showScene && frame && center && conversation) {
      next.set(frame, 'canvas')
      next.set(center, 'canvas')
      next.set(conversation, 'canvas')
    }
    if ((showGlass || showHolo) && sidebar && sidebarContent) {
      next.set(sidebar, 'glass')
      next.set(sidebarContent, 'glass-content')
    }
    setMarks(next)
    scene.setAttribute(SCENE, mode)
    scene.hidden = !showScene
    conversationSurface = showScene ? conversation ?? undefined : undefined
    holographicSurface = showHolo ? sidebar ?? undefined : undefined
    budget = effectQuality[mode === 'economy' ? 'low' : quality]
    if (aurora) {
      auroraBlur = Math.min(aurora.params.blur, budget.auroraBlur)
      scene.style.setProperty('--dsh-aurora-blur', `${auroraBlur}px`)
    }
    if (glassNode) {
      glassNode.hidden = !showGlass && !showHolo
      glassNode.toggleAttribute('data-dsh-skin-glass-fallback', !showGlass)
      if (glass) glassNode.style.setProperty('--dsh-glass-blur', `${Math.min(glass.params.blur, budget.glassBlur)}px`)
    }
    if (holoNode) holoNode.hidden = !showHolo
    for (const node of flowNodes) {
      node.hidden = !showFlow
      node.setAttribute(MOTION, mode)
    }
    for (const node of sidebarLayers) {
      if (node.parentElement && node.parentElement !== frame) node.remove()
      if (frame && !node.hidden && node.parentElement !== frame) frame.append(node)
    }
    playback()

    if (mode === 'off' && !artwork) return
    for (const parent of [document.body, root, rootSlot, center, mainSlot, conversationSlot, conversation, sidebar, sidebarSlot]) {
      if (parent) observer.observe(parent, { childList: true })
    }
    if (main) observer.observe(main, { childList: true, attributeFilter: ['data-global-panel'] })
    if (frame) observer.observe(frame, { childList: true, attributeFilter: ['data-sidebar-drawer', 'data-sidebar-collapsed'] })
  }

  const observer = new view.MutationObserver(reconcile)
  function dispose() {
    if (disposed) return
    disposed = true
    observer.disconnect()
    document.removeEventListener('visibilitychange', playback)
    document.removeEventListener('pointerdown', deferCssMotion, true)
    document.removeEventListener('keydown', deferCssMotion, true)
    view.clearTimeout(interactionTimer)
    transparency.removeEventListener('change', reconcile)
    reducedMotion.removeEventListener('change', playback)
    bindInput()
    scheduler.trackCss(false)
    auroraPaint?.dispose()
    canvas?.dispose()
    refractor?.dispose()
    setMarks(new Map())
    scene.remove()
    for (const node of sidebarLayers) node.remove()
    style.remove()
  }
  try {
    document.head.append(style)
    if (!style.sheet) {
      dispose()
      return
    }
    document.body.append(scene)
    if (auroraLayers.length > 0) auroraPaint = mountAuroraPaint(view, auroraLayers, auroraNear, auroraFar)
    if (drawDust || stars || ripples) {
      canvas = mountCanvas(scene, scheduler, (context, width, height, delta, quality) => {
        drawDust?.(context, width, height, delta, quality)
        stars?.draw(context, width, height, delta, quality, p1Motion)
        if (p1Motion && ripples?.active()) ripples.draw(context, view.performance.now())
      }, syncCanvas)
    }
    document.addEventListener('visibilitychange', playback)
    if (aurora || flow) {
      document.addEventListener('pointerdown', deferCssMotion, { capture: true, passive: true })
      document.addEventListener('keydown', deferCssMotion, { capture: true, passive: true })
    }
    transparency.addEventListener('change', reconcile)
    reducedMotion.addEventListener('change', playback)
    reconcile()
  } catch (error) {
    dispose()
    throw error
  }
  return {
    configure(nextMode: EffectMode, nextQuality: Quality) {
      mode = nextMode
      quality = nextQuality
      reconcile()
    },
    dispose,
  }
}

export function createEffectsRuntime(document: Document) {
  const scheduler = createFrameScheduler(document.defaultView!)
  const auto = createAutoQuality()
  let mode: EffectMode = 'dynamic'
  let qualityOverride: QualityChoice | undefined
  let skinQuality: QualityChoice = 'balanced'
  let refraction: RefractionStatus = 'off'
  let active: ReturnType<typeof mountLayers>
  const listeners = new Set<() => void>()
  const preference = () => qualityOverride ?? skinQuality
  function quality(): Quality {
    const chosen = preference()
    return chosen === 'auto' ? auto.get() : chosen
  }
  function notify() { for (const listener of listeners) listener() }
  function reportRefraction(status: RefractionStatus) {
    if (refraction === status) return
    refraction = status
    notify()
  }
  function resetAuto() {
    auto.reset()
    scheduler.observe(preference() === 'auto' ? {
      resetSamples: auto.resetSamples,
      sample(intervalMs, workMs) {
        const previous = auto.get()
        const next = auto.sample(intervalMs, workMs)
        if (next === previous) return
        active?.configure(mode, next)
        notify()
      },
    } : undefined)
  }
  return {
    getMode: () => mode,
    getQuality: () => qualityOverride,
    getEffectiveQuality: () => mode === 'economy' ? 'low' : quality(),
    getRefraction: () => refraction,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setMode(next: EffectMode) {
      if (mode === next) return
      mode = next
      active?.configure(mode, quality())
      notify()
    },
    setQuality(next: QualityChoice | undefined) {
      if (qualityOverride === next) return
      qualityOverride = next
      resetAuto()
      active?.configure(mode, quality())
      notify()
    },
    mount(effects: readonly SkinEffect[], accent = '#b9dcff', preferredQuality: QualityChoice = 'balanced', artwork?: PreparedArtwork) {
      active?.dispose()
      skinQuality = preferredQuality
      resetAuto()
      const mounted = mountLayers(document, effects, accent, mode, quality(), scheduler, reportRefraction, artwork)
      active = mounted
      notify()
      return () => {
        if (active !== mounted) return
        active = undefined
        mounted?.dispose()
        reportRefraction('off')
      }
    },
  }
}
