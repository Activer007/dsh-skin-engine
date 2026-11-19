import type { EffectDefinition, EffectParams, EffectRenderer, SkinEffect } from '../../../core/effects.js'
import type { Quality } from '../../../shared/preferences.js'
import type { createFrameScheduler } from '../frame-scheduler.js'

export const EFFECT_PROVIDER_API = '1.0.0'

export type EffectMode = 'dynamic' | 'static' | 'economy' | 'off'
export type RefractionStatus = 'off' | 'css' | 'webgl'
export type EffectPlacement = 'scene' | 'under-artwork' | 'sidebar' | HTMLElement
export type ProviderFailure = 'mount' | 'layout' | 'update' | 'pause' | 'resume' | 'renderer' | 'draw' | 'frame' | 'event' | 'fallback' | 'dispose'

export interface EffectLayout {
  mode: EffectMode
  quality: Quality
  canvas: boolean
  sidebarGrid: boolean
  filterSupported: boolean
  reducedTransparency: boolean
}

export interface EffectPlayback extends EffectLayout {
  visible: boolean
  dynamic: boolean
  p1Motion: boolean
  conversationInput?: Element
  sidebarInput?: Element
}

export interface CanvasContribution {
  visible(): boolean
  animated(): boolean
  draw(context: CanvasRenderingContext2D, width: number, height: number, delta: number): void
}

export interface EffectContext {
  readonly scene: HTMLElement
  readonly view: Window & typeof globalThis
  readonly accent: string
  readonly frames: Pick<ReturnType<typeof createFrameScheduler>, 'add'>
  layer(kind: string, placement?: EffectPlacement, cssMotion?: boolean): HTMLElement
  sidebarGlass(material: boolean): { node: HTMLElement; show(visible: boolean): void }
  own(release: () => void): () => void
  guard<Args extends unknown[]>(callback: (...args: Args) => void | Promise<void>): (...args: Args) => void
  syncCanvas(): void
  reportRefraction(status: RefractionStatus): void
}

export interface EffectInstance<Budget> {
  layout?(state: EffectLayout, budget: Budget): boolean
  update?(state: EffectPlayback, budget: Budget): boolean | void
  pause?(): void
  resume?(): void
  dispose?(): void
  readonly layerRenderer?: EffectRenderer
  readonly canvas?: CanvasContribution
}

export interface EffectProvider<Params, Budget> {
  readonly api: typeof EFFECT_PROVIDER_API
  readonly cssMotion?: boolean
  budget(quality: Quality): Budget
  mount(context: EffectContext, params: Params): EffectInstance<Budget> | undefined
  fallback?(context: EffectContext, params: Params, failure: ProviderFailure): EffectInstance<Budget> | undefined
}

export interface RegisteredProvider<Id extends SkinEffect['id'] = SkinEffect['id']> {
  readonly id: Id
  readonly renderer: EffectRenderer
  readonly schema: EffectDefinition['schema']
  readonly api: typeof EFFECT_PROVIDER_API
  readonly cssMotion: boolean
  mount(context: EffectContext, effect: SkinEffect): EffectInstance<Quality> | undefined
  fallback?(context: EffectContext, effect: SkinEffect, failure: ProviderFailure): EffectInstance<Quality> | undefined
}

export function defineProvider<Definition extends EffectDefinition, Budget>(definition: Definition,
  provider: EffectProvider<EffectParams<Definition['id']>, Budget>): RegisteredProvider<Definition['id']> {
  function bind(instance: EffectInstance<Budget> | undefined): EffectInstance<Quality> | undefined {
    if (!instance) return
    return {
      layout: instance.layout && ((state, quality) => instance.layout!(state, provider.budget(quality))),
      update: instance.update && ((state, quality) => instance.update!(state, provider.budget(quality))),
      pause: instance.pause?.bind(instance), resume: instance.resume?.bind(instance), dispose: instance.dispose?.bind(instance),
      layerRenderer: instance.layerRenderer, canvas: instance.canvas,
    }
  }
  function params(effect: SkinEffect) {
    return definition.schema.parse(effect).params as EffectParams<Definition['id']>
  }
  return {
    id: definition.id, renderer: definition.renderer, schema: definition.schema,
    api: provider.api, cssMotion: provider.cssMotion ?? false,
    mount: (context, effect) => bind(provider.mount(context, params(effect))),
    fallback: provider.fallback && ((context, effect, failure) => bind(provider.fallback!(context, params(effect), failure))),
  }
}
