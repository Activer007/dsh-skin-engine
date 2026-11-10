import * as z from 'zod/mini'
import { skinIdSchema } from '../core/manifest.js'
import { hexColor } from '../core/tokens.js'
import { editableColors, editableEffects, qualityLevels } from '../shared/preferences.js'

export const skinPreferencesSchema = z.strictObject({
  colors: z.optional(z.partialRecord(z.enum(editableColors), hexColor)),
  effects: z.optional(z.partialRecord(z.enum(editableEffects), z.strictObject({
    enabled: z.optional(z.boolean()),
    strength: z.optional(z.number().check(z.minimum(0), z.maximum(1))),
  }))),
  quality: z.optional(z.enum(qualityLevels)),
})

export const profilePreferencesSchema = z.record(skinIdSchema, skinPreferencesSchema)
  .check(z.refine(value => Object.keys(value).length <= 259))
