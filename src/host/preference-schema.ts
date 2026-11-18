import { artworkAssetPattern } from '../shared/user-artwork.js'
import * as z from 'zod/mini'
import { describeEffect, effectDescriptors, type Bounds, type EditableEffect } from '../core/effect-descriptors.js'
import { skinIdSchema } from '../core/manifest.js'
import { hexColor } from '../core/tokens.js'
import { editableColors, editableEffects, qualityLevels } from '../shared/preferences.js'

const secondary = effectDescriptors['ambient.aurora'].secondary.controls
const numericPreference = ([minimum, maximum]: Bounds) => z.optional(z.number().check(z.minimum(minimum), z.maximum(maximum)))

export const artworkPreferenceSchema = z.strictObject({
  asset: z.string().check(z.regex(artworkAssetPattern)),
  fit: z.enum(['contain', 'cover']),
  x: z.number().check(z.minimum(0), z.maximum(100)),
  y: z.number().check(z.minimum(0), z.maximum(100)),
  scale: z.number().check(z.minimum(0.5), z.maximum(2)),
  opacity: z.number().check(z.minimum(0), z.maximum(0.5)),
})

export const skinPreferencesSchema = z.strictObject({
  artwork: z.optional(artworkPreferenceSchema),
  colors: z.optional(z.partialRecord(z.enum(editableColors), hexColor)),
  effects: z.optional(z.partialRecord(z.enum(editableEffects), z.strictObject({
    enabled: z.optional(z.boolean()),
    strength: z.optional(z.number().check(z.minimum(0), z.maximum(1))),
    speed: numericPreference(secondary.speed.bounds),
    movement: numericPreference(secondary.movement.bounds),
  })).check(z.refine(effects => Object.entries(effects).every(([id, effect]) =>
    (effect.speed === undefined && effect.movement === undefined)
      || (Object.hasOwn(effectDescriptors, id) && Boolean(describeEffect(id as EditableEffect).secondary)))))),
  quality: z.optional(z.enum(qualityLevels)),
})

export const profilePreferencesSchema = z.record(skinIdSchema, skinPreferencesSchema)
  .check(z.refine(value => Object.keys(value).length <= 259))
