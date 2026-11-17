import { effectDefinitions } from '../../../core/effects.js'
import { mountAuroraPaint } from '../aurora.js'
import { createHolographic } from '../holographic.js'
import { createEffectInput } from '../interaction.js'
import { effectQuality } from '../quality.js'
import { mountRefraction } from '../refraction.js'
import { defineProvider, EFFECT_PROVIDER_API, type EffectContext, type EffectLayout, type EffectPlayback } from './contract.js'

function setVariables(node: HTMLElement, values: Record<string, string | number>, context?: EffectContext) {
  for (const [name, value] of Object.entries(values)) {
    const property = `--dsh-${name}`
    node.style.setProperty(property, String(value))
    context?.own(() => node.style.removeProperty(property))
  }
}

export const glass = defineProvider(effectDefinitions.glass, {
  api: EFFECT_PROVIDER_API,
  budget: quality => effectQuality[quality].glassBlur,
  mount(context, { blur, tintAlpha, saturation, edgeLight, frost }) {
    const glass = context.sidebarGlass(true)
    setVariables(glass.node, {
      'glass-fill': `${(0.68 + tintAlpha * 0.75 + frost * 0.06) * 100}%`,
      'glass-saturation': saturation, 'glass-glint': 0.035 + frost * 0.09, 'glass-edge': edgeLight * 0.6,
    }, context)
    context.own(() => glass.node.style.removeProperty('--dsh-glass-blur'))
    return {
      layout(state, maxBlur) {
        const show = state.sidebarGrid && state.filterSupported && state.mode !== 'economy' && !state.reducedTransparency
        glass.show(show)
        glass.node.style.setProperty('--dsh-glass-blur', `${Math.min(blur, maxBlur)}px`)
        return show
      },
    }
  },
})

export const aurora = defineProvider(effectDefinitions.aurora, {
  api: EFFECT_PROVIDER_API,
  cssMotion: true,
  budget: quality => effectQuality[quality].auroraBlur,
  mount(context, { palette, direction, intensity, speed, blur, movement }) {
    const [near, far] = palette === 'aurora' ? ['#37e2a7', '#7867ff'] : ['#28cbe2', '#7361ee']
    const layers = [context.layer('aurora'), context.layer('aurora')]
    if (movement !== undefined) {
      const [front, back] = layers
      for (const layer of layers) layer.setAttribute('data-dsh-skin-aurora-curtain', movement ? 'dynamic' : 'still')
      setVariables(front, { 'aurora-sweep': `${movement * 11}%`, 'aurora-turn': `${movement * -32}deg` })
      setVariables(back, { 'aurora-sweep': `${movement * -9}%`, 'aurora-turn': `${movement * 29}deg` })
      setVariables(context.scene, {
        'aurora-scale': 1 + 0.17 * movement,
        'aurora-pulse': 1 - 0.32 * movement,
      }, context)
    }
    const paint = mountAuroraPaint(context.view, layers, near, far)
    if (paint) context.own(paint.dispose)
    setVariables(context.scene, {
      'aurora-near': near, 'aurora-far': far, 'aurora-direction': `${direction}deg`,
      'aurora-intensity': intensity * 0.65, 'aurora-duration': `${(movement === undefined ? 20 : 8) / speed}s`,
    }, context)
    context.own(() => context.scene.style.removeProperty('--dsh-aurora-blur'))
    return {
      layout(state, maxBlur) {
        context.scene.style.setProperty('--dsh-aurora-blur', `${Math.min(blur, maxBlur)}px`)
        return state.canvas
      },
      update(state, maxBlur) { paint?.configure(state.dynamic && movement !== 0 ? Math.min(blur, maxBlur) : 0) },
    }
  },
})

export const brightness = defineProvider(effectDefinitions.brightness, {
  api: EFFECT_PROVIDER_API,
  budget: () => undefined,
  mount(context, { level }) {
    if (level === 1) return
    setVariables(context.scene, { 'scene-brightness': `brightness(${level})` }, context)
    return {}
  },
})

export const flow = defineProvider(effectDefinitions.flow, {
  api: EFFECT_PROVIDER_API,
  cssMotion: true,
  budget: () => undefined,
  mount(context, { count, route, width, speed, intensity, colorStops }) {
    const edge = route === 'edge'
    const nodes: HTMLElement[] = []
    for (let index = 0; index < count; index++) {
      const node = context.layer(edge ? 'edge' : 'flow', edge ? 'sidebar' : 'scene', true)
      if (edge) node.append(context.scene.ownerDocument.createElement('span'))
      setVariables(node, {
        'flow-width': `${width * (index === 0 ? 1 : 0.55)}px`, 'flow-intensity': intensity * (index === 0 ? 1 : 0.55),
        'flow-y': `${73 + index * 8}%`, 'flow-offset': `${index * (width + 3)}px`,
        'flow-duration': `${14 / speed}s`, 'flow-stops': colorStops.join(', '),
      })
      nodes.push(node)
    }
    return {
      layout(state) {
        const show = state.canvas && state.mode !== 'economy' && (!edge || state.sidebarGrid)
        for (const node of nodes) {
          node.hidden = !show
          node.setAttribute('data-dsh-skin-motion', state.mode)
        }
        return show
      },
    }
  },
})

export const holographic = defineProvider(effectDefinitions.holographic, {
  api: EFFECT_PROVIDER_API,
  budget: quality => effectQuality[quality].p1Motion,
  mount(context, params) {
    const glass = context.sidebarGlass(false)
    const node = context.layer('holographic', glass.node)
    const holo = createHolographic(node, params, context.frames)
    const bind = createEffectInput(context.scene.ownerDocument, { holo, syncCanvas: context.syncCanvas })
    return {
      layout(state) {
        const show = state.sidebarGrid && !state.reducedTransparency
        node.hidden = !show
        glass.show(show)
        return show
      },
      update(state, motion) {
        return bind(undefined, motion && state.p1Motion && !node.hidden && params.pointerInfluence ? state.sidebarInput : undefined)
      },
      dispose() { bind() },
    }
  },
})

function refractionMaterial(context: EffectContext) {
  const node = context.layer('refraction-fallback', 'under-artwork')
  node.style.setProperty('--dsh-refraction-accent', context.accent)
  node.hidden = true
  return {
    layout: (state: EffectLayout) => state.canvas && !state.reducedTransparency,
    show(state: EffectPlayback | undefined, rendering: boolean) {
      const visible = !!state?.visible && !state.reducedTransparency
      node.hidden = !visible || rendering
      context.reportRefraction(!visible ? 'off' : rendering ? 'webgl' : 'css')
    },
  }
}

export const refraction = defineProvider(effectDefinitions.refraction, {
  api: EFFECT_PROVIDER_API,
  budget: quality => ({ quality, webgl: quality !== 'low' }),
  mount(context, params) {
    const material = refractionMaterial(context)
    let refractor: ReturnType<typeof mountRefraction>
    let state: EffectPlayback | undefined
    let unavailable = false
    let rendering = false
    function stop() {
      const mounted = refractor
      refractor = undefined
      mounted?.dispose()
    }
    return {
      layout: material.layout,
      update(next, { quality, webgl }) {
        state = next
        if (!next.dynamic || !webgl || next.reducedTransparency) stop()
        else if (refractor) refractor.configure(quality)
        else if (!unavailable) {
          refractor = mountRefraction(context.scene, context.frames, params, context.accent, quality, active => {
            rendering = active
            material.show(state, rendering)
          })
          unavailable = !refractor
        }
        material.show(state, rendering)
      },
      dispose() { state = undefined; stop(); material.show(undefined, false) },
    }
  },
  fallback(context) {
    const material = refractionMaterial(context)
    return {
      layout: material.layout,
      update(state) { material.show(state, false) },
      dispose() { material.show(undefined, false) },
    }
  },
})
