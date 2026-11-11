import { effectDefinitions } from '../../../core/effects.js'
import { createDust } from '../dust.js'
import { createEffectInput } from '../interaction.js'
import { effectQuality, type EffectBudget } from '../quality.js'
import { createRipples } from '../ripple.js'
import { createStarfield } from '../starfield.js'
import { defineProvider, EFFECT_PROVIDER_API } from './contract.js'

export const dust = defineProvider(effectDefinitions.dust, {
  api: EFFECT_PROVIDER_API,
  budget: quality => effectQuality[quality],
  mount(context, params) {
    if (params.density === 0 || params.opacity === 0) return
    const draw = createDust(params, context.accent)
    let budget: EffectBudget = effectQuality.balanced
    let dynamic = false
    return {
      update(state, next) { budget = next; dynamic = state.dynamic },
      canvas: {
        visible: () => true,
        animated: () => dynamic,
        draw(ctx, width, height, delta) { draw(ctx, width, height, delta, budget) },
      },
    }
  },
})

export const stars = defineProvider(effectDefinitions.stars, {
  api: EFFECT_PROVIDER_API,
  budget: quality => effectQuality[quality],
  mount(context, params) {
    if (params.starCount === 0 || params.brightness === 0) return
    const stars = createStarfield(params, context.accent)
    const bind = createEffectInput(context.scene.ownerDocument, { stars, parallax: params.parallax, syncCanvas: context.syncCanvas })
    let budget: EffectBudget = effectQuality.balanced
    let motion = false
    return {
      update(state, next) {
        budget = next
        motion = state.p1Motion
        return bind(motion ? state.conversationInput : undefined)
      },
      dispose() { bind() },
      canvas: {
        visible: () => true,
        animated: () => motion && stars.needsFrame(),
        draw(ctx, width, height, delta) { stars.draw(ctx, width, height, delta, budget, motion) },
      },
    }
  },
})

export const ripple = defineProvider(effectDefinitions.ripple, {
  api: EFFECT_PROVIDER_API,
  budget: quality => effectQuality[quality].p1Motion,
  mount(context, params) {
    const ripples = createRipples(params)
    const bind = createEffectInput(context.scene.ownerDocument, { ripples, syncCanvas: context.syncCanvas })
    let motion = false
    const active = () => motion && ripples.active()
    return {
      update(state, enabled) {
        motion = enabled && state.p1Motion
        return bind(motion ? state.conversationInput : undefined)
      },
      dispose() { bind() },
      canvas: { visible: active, animated: active, draw(ctx) { ripples.draw(ctx, context.view.performance.now()) } },
    }
  },
})
