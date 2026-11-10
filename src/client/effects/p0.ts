import type { SkinEffect } from '../../core/effects.js'
import type { SceneSpec } from '../../core/scene.js'
import type { Quality, QualityChoice } from '../../shared/preferences.js'
import type { PreparedArtwork } from '../../shared/skins.js'
import { effectiveScenePreset, sceneEffects, type ScenePreset } from '../scene/presets.js'
import { createAutoQuality } from './auto-quality.js'
import { createFrameScheduler } from './frame-scheduler.js'
import { mountEffectScene, type EffectMode, type RefractionStatus } from './scene.js'

export type { EffectMode } from './scene.js'

export function createEffectsRuntime(document: Document) {
  const scheduler = createFrameScheduler(document.defaultView!)
  const auto = createAutoQuality()
  let mode: EffectMode = 'dynamic'
  let qualityOverride: QualityChoice | undefined
  let skinQuality: QualityChoice = 'balanced'
  let refraction: RefractionStatus = 'off'
  let active: ReturnType<typeof mountEffectScene>
  let skin: { update: () => void; dispose: () => void; preset: () => ScenePreset | undefined } | undefined
  let scenePreset: ScenePreset = 'dynamic'
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
    getScenePreset: () => skin?.preset() ? scenePreset : undefined,
    getEffectiveScenePreset: () => skin?.preset(),
    getQuality: () => qualityOverride,
    getEffectiveQuality: () => mode === 'economy' ? 'low' : quality(),
    getRefraction: () => refraction,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setMode(next: EffectMode) {
      if (mode === next) return
      mode = next
      skin?.update()
      notify()
    },
    setScenePreset(next: ScenePreset) {
      if (scenePreset === next || !skin?.preset()) return
      scenePreset = next
      skin.update()
      notify()
    },
    setQuality(next: QualityChoice | undefined) {
      if (qualityOverride === next) return
      qualityOverride = next
      resetAuto()
      active?.configure(mode, quality())
      notify()
    },
    mount(effects: readonly SkinEffect[], accent = '#b9dcff', preferredQuality: QualityChoice = 'balanced', artwork?: PreparedArtwork,
      presets?: SceneSpec['presets']) {
      skin?.dispose()
      skinQuality = preferredQuality
      const reducedMotion = presets && document.defaultView!.matchMedia('(prefers-reduced-motion: reduce)')
      let applied: ScenePreset | undefined
      let initialized = false

      function update() {
        const next = presets ? effectiveScenePreset(scenePreset, mode, !!reducedMotion?.matches) : undefined
        if (initialized && next === applied) {
          active?.configure(mode, quality())
          return
        }
        active?.dispose()
        active = undefined
        applied = next
        reportRefraction('off')
        resetAuto()
        const selected = presets && next ? sceneEffects(effects, presets, next) : effects
        active = mountEffectScene(document, selected, accent, mode, quality(), scheduler, reportRefraction, artwork, next)
        initialized = true
      }
      function onMotion() { update(); notify() }
      function dispose() {
        if (skin !== owner) return
        skin = undefined
        reducedMotion?.removeEventListener('change', onMotion)
        const mounted = active
        active = undefined
        mounted?.dispose()
        scheduler.observe(undefined)
        reportRefraction('off')
        notify()
      }
      const owner = { update, dispose, preset: () => applied }
      skin = owner
      try {
        update()
        reducedMotion?.addEventListener('change', onMotion)
      } catch (error) {
        dispose()
        throw error
      }
      notify()
      return dispose
    },
  }
}
