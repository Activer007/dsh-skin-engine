import type { SkinEffect } from '../../../core/effects.js'
import {
  EFFECT_PROVIDER_API, type EffectContext, type EffectLayout, type EffectPlayback, type ProviderFailure, type RegisteredProvider,
} from './contract.js'

type SceneContext = Omit<EffectContext, 'own' | 'guard' | 'layer' | 'sidebarGlass'> & {
  layer(...args: Parameters<EffectContext['layer']>): { node: HTMLElement; release(): void }
  sidebarGlass(material: boolean): ReturnType<EffectContext['sidebarGlass']> & { release(): void }
}
type ReportFailure = (id: SkinEffect['id'], stage: ProviderFailure) => void

export function createProviderRegistry(providers: readonly RegisteredProvider[]) {
  const registered = new Map<SkinEffect['id'], RegisteredProvider>()
  for (const provider of providers) {
    if (provider.api !== EFFECT_PROVIDER_API) throw new Error(`Incompatible effect Provider API for ${provider.id}`)
    if (registered.has(provider.id)) throw new Error(`Duplicate effect Provider ${provider.id}`)
    registered.set(provider.id, provider)
  }
  return {
    mount(effects: readonly SkinEffect[], context: SceneContext, changed: () => void, report: ReportFailure) {
      const selected = new Map<SkinEffect['id'], SkinEffect>()
      for (const effect of effects) {
        if (effect.enabled && !selected.has(effect.id)) selected.set(effect.id, effect)
      }
      return [...registered.values()].flatMap(provider => {
        const effect = selected.get(provider.id)
        if (!effect || effect.renderer !== provider.renderer) return []
        return [mountProvider(provider, effect, context, changed, report)]
      })
    },
  }
}

function mountProvider(provider: RegisteredProvider, effect: SkinEffect, base: SceneContext,
  changed: () => void, report: ReportFailure) {
  let instance: ReturnType<RegisteredProvider['mount']>
  let scope: ReturnType<typeof createScope> | undefined
  let fallback = false
  let disposed = false
  let moving = false
  let visible = false

  function note(stage: ProviderFailure) { report(effect.id, stage) }

  function createScope() {
    const releases = new Set<() => void>()
    let active = true
    function own(release: () => void) {
      if (!active) {
        release()
        return () => {}
      }
      const stop = () => { if (releases.delete(stop)) release() }
      releases.add(stop)
      return stop
    }
    const context: EffectContext = {
      ...base,
      own,
      guard(callback) {
        return (...args) => {
          if (!active) return
          const result = guard('event', () => callback(...args))
          void result?.catch(() => { if (active) fail('event') })
        }
      },
      layer(kind, placement, cssMotion) {
        const { node, release } = base.layer(kind, placement, cssMotion)
        own(release)
        return node
      },
      sidebarGlass(material) {
        const glass = base.sidebarGlass(material)
        own(glass.release)
        return glass
      },
      frames: {
        add(task) {
          if (!active || fallback) return () => {}
          return own(base.frames.add(delta => { if (active) guard('frame', () => task(delta)) }))
        },
      },
    }
    return {
      context,
      close(dispose?: () => void) {
        active = false
        for (const release of [dispose, ...[...releases].reverse()]) {
          try { release?.() } catch { note('dispose') }
        }
      },
    }
  }

  function clear() {
    const current = instance
    const owned = scope
    instance = scope = undefined
    moving = visible = false
    owned?.close(current?.dispose)
  }

  function start(failure?: ProviderFailure) {
    scope = createScope()
    try {
      instance = failure ? provider.fallback?.(scope.context, effect, failure) : provider.mount(scope.context, effect)
      if (!instance) clear()
      else if (instance.canvas && provider.renderer !== 'canvas2d') throw new Error('Provider did not declare a Canvas renderer')
    } catch {
      clear()
      if (failure) note('fallback')
      else fail('mount')
    }
  }

  function fail(stage: ProviderFailure) {
    clear()
    note(stage)
    if (!disposed && !fallback && provider.fallback) {
      fallback = true
      start(stage)
    }
    changed()
  }

  function guard<T>(stage: ProviderFailure, action: () => T) {
    try { return action() } catch { fail(stage) }
  }

  start()
  return {
    get layerRenderer() { return visible && instance ? instance.layerRenderer ?? (fallback ? 'css' : provider.renderer) : undefined },
    get mounted() { return !!instance },
    get canvas() { return !!instance?.canvas },
    get hasCssMotion() { return provider.cssMotion },
    get cssAnimating() { return visible && !fallback && provider.cssMotion },
    layout(state: EffectLayout) {
      visible = guard('layout', () => instance?.layout?.(state, state.quality)) ?? false
      return visible
    },
    update(state: EffectPlayback) {
      const current = instance
      if (!current) return false
      if (fallback && state.dynamic) state = { ...state, dynamic: false, p1Motion: false, conversationInput: undefined, sidebarInput: undefined }
      if (moving && !state.dynamic) {
        moving = false
        guard('pause', () => current.pause?.())
      }
      if (instance !== current) return false
      const redraw = guard('update', () => current.update?.(state, state.quality)) === true
      if (instance === current && !moving && state.dynamic) {
        moving = true
        guard('resume', () => current.resume?.())
      }
      return redraw
    },
    drawsCanvas() { return guard('draw', () => instance?.canvas?.visible()) === true },
    animatesCanvas() { return !fallback && guard('draw', () => instance?.canvas?.animated()) === true },
    unavailableCanvas() { if (instance?.canvas) fail('renderer') },
    draw(ctx: CanvasRenderingContext2D, width: number, height: number, delta: number) {
      if (!this.drawsCanvas()) return
      ctx.save()
      try { guard('draw', () => instance?.canvas?.draw(ctx, width, height, delta)) }
      finally { ctx.restore() }
    },
    dispose() {
      if (disposed) return
      disposed = true
      clear()
    },
  }
}
