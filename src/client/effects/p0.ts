import type { SkinEffect } from '../../core/effects.js'
import type { SceneSpec } from '../../core/scene.js'
import type { Quality, QualityChoice } from '../../shared/preferences.js'
import type { PreparedArtwork } from '../../shared/skins.js'
import { effectiveScenePreset, sceneEffects, type ScenePreset } from '../scene/presets.js'
import { createAutoQuality } from './auto-quality.js'
import { createFrameScheduler } from './frame-scheduler.js'
import { mountEffectScene, type EffectMode, type RefractionStatus, type RenderDiagnostic } from './scene.js'

export const SIDEBAR_EFFECTS_KEY = 'dsh-skin-engine.sidebar-effects.v1'

const windowExperiences = {
  follow: { mode: 'dynamic', quality: undefined },
  focus: { mode: 'static', quality: 'low' },
  balanced: { mode: 'dynamic', quality: 'auto' },
  immersive: { mode: 'dynamic', quality: 'high' },
} as const satisfies Record<string, { mode: EffectMode; quality: QualityChoice | undefined }>
export type WindowExperience = keyof typeof windowExperiences

export type { EffectMode } from './scene.js'

export function createEffectsRuntime(document: Document) {
  const scheduler = createFrameScheduler(document.defaultView!)
  const auto = createAutoQuality()
  let experience: WindowExperience | 'custom' = 'follow'
  let mode: EffectMode = 'dynamic'
  let sidebarEffects = false
  let sidebarEffectsPersistent = false
  let storage: Storage | undefined
  try {
    storage = document.defaultView!.localStorage
    sidebarEffects = storage?.getItem(SIDEBAR_EFFECTS_KEY) === 'true'
    sidebarEffectsPersistent = !!storage
  } catch { /* Privacy modes retain the setting only for this session. */ }
  let qualityOverride: QualityChoice | undefined
  let skinQuality: QualityChoice = 'balanced'
  let diagnostic: RenderDiagnostic | undefined
  let refraction: RefractionStatus = 'off'
  let active: ReturnType<typeof mountEffectScene>
  let skin: { update: () => void; dispose: () => void; preset: () => ScenePreset | undefined } | undefined
  let scenePreset: ScenePreset = 'dynamic'
  const listeners = new Set<() => void>()
  let notificationQueued = false
  const preference = () => qualityOverride ?? skinQuality
  function quality(): Quality {
    const chosen = preference()
    return chosen === 'auto' ? auto.get() : chosen
  }
  function notify() {
    // Publish after ownership has settled. A subscriber may select another scene.
    if (notificationQueued) return
    notificationQueued = true
    queueMicrotask(() => {
      notificationQueued = false
      for (const listener of listeners) listener()
    })
  }
  function reportDiagnostic(next?: RenderDiagnostic) {
    if (next === diagnostic || next && diagnostic && next.css === diagnostic.css && next.canvas2d === diagnostic.canvas2d
      && next.reason === diagnostic.reason && next.failure === diagnostic.failure) return
    diagnostic = next
    notify()
  }
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
        active?.configure(mode, next, sidebarEffects)
        notify()
      },
    } : undefined)
  }
  function configureWindow(nextMode: EffectMode, nextQuality: QualityChoice | undefined, nextExperience: typeof experience) {
    const qualityChanged = qualityOverride !== nextQuality
    const modeChanged = mode !== nextMode
    if (!qualityChanged && !modeChanged && experience === nextExperience) return
    mode = nextMode
    qualityOverride = nextQuality
    experience = nextExperience
    if (qualityChanged) resetAuto()
    if (modeChanged || qualityChanged) skin?.update()
    notify()
  }
  return {
    getExperience: () => experience,
    setExperience(next: WindowExperience) {
      const preset = windowExperiences[next]
      configureWindow(preset.mode, preset.quality, next)
    },
    getDiagnostic: () => diagnostic,
    getMode: () => mode,
    getSidebarEffects: () => sidebarEffects,
    getSidebarEffectsPersistent: () => sidebarEffectsPersistent,
    setSidebarEffects(next: boolean) {
      if (sidebarEffects === next) return
      sidebarEffects = next
      try {
        if (!storage) throw new Error('Storage unavailable')
        storage.setItem(SIDEBAR_EFFECTS_KEY, String(next))
        sidebarEffectsPersistent = true
      } catch { sidebarEffectsPersistent = false }
      active?.configure(mode, quality(), sidebarEffects)
      notify()
    },
    getScenePreset: () => skin?.preset() ? scenePreset : undefined,
    getEffectiveScenePreset: () => skin?.preset(),
    getQuality: () => qualityOverride,
    getEffectiveQuality: () => mode === 'economy' ? 'low' : quality(),
    getRefraction: () => refraction,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setMode(next: EffectMode) {
      if (mode !== next) configureWindow(next, qualityOverride, 'custom')
    },
    setScenePreset(next: ScenePreset) {
      if (scenePreset === next || !skin?.preset()) return
      scenePreset = next
      skin.update()
      notify()
    },
    setQuality(next: QualityChoice | undefined) {
      if (qualityOverride !== next) configureWindow(mode, next, 'custom')
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
          active?.configure(mode, quality(), sidebarEffects)
          return
        }
        active?.dispose()
        active = undefined
        applied = next
        reportDiagnostic()
        reportRefraction('off')
        resetAuto()
        const selected = presets && next ? sceneEffects(effects, presets, next) : effects
        active = mountEffectScene(document, selected, accent, mode, quality(), scheduler, reportRefraction, artwork, next, sidebarEffects, reportDiagnostic)
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
        reportDiagnostic()
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
