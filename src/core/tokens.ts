import * as z from 'zod/mini'
import { parseFile } from './validation.js'

export const hexColor = z.string().check(z.regex(/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i))
const radius = z.int().check(z.minimum(0), z.maximum(64))
const pillRadius = z.int().check(z.minimum(0), z.maximum(999))
const uiFont = z.enum(['system-ui', 'sans-serif', 'serif'])
const monoFont = z.enum(['ui-monospace', 'monospace'])

const panelShadow = z.string().check(z.maxLength(80), z.refine(value => {
  if (value === 'none') return true
  const match = /^(0|-?\d{1,2}px) (0|-?\d{1,2}px) (0|\d{1,3}px) rgba\((\d{1,3}), ?(\d{1,3}), ?(\d{1,3}), ?(0|1|0?\.\d{1,3})\)$/.exec(value)
  if (!match || match[0] !== value) return false
  const [, , , blur, red, green, blue] = match
  return Number.parseInt(blur) <= 128 && [red, green, blue].every(channel => Number(channel) <= 255)
}, 'Expected one bounded rgba shadow or none'))

const tokensSchema = z.strictObject({
  schema: z.literal('dsh.tokens/v1'),
  colors: z._default(z.strictObject({
    canvas: z.optional(hexColor),
    surface: z.optional(hexColor),
    surfaceRaised: z.optional(hexColor),
    textPrimary: z.optional(hexColor),
    textSecondary: z.optional(hexColor),
    accent: z.optional(hexColor),
    accentStrong: z.optional(hexColor),
  }), {}),
  radius: z._default(z.strictObject({
    panel: z.optional(radius),
    control: z.optional(radius),
    pill: z.optional(pillRadius),
  }), {}),
  typography: z._default(z.strictObject({ uiFont: z.optional(uiFont), monoFont: z.optional(monoFont) }), {}),
  shadow: z._default(z.strictObject({ panel: z.optional(panelShadow) }), {}),
})

export function parseSkinTokens(value: unknown) {
  return parseFile(tokensSchema, value, 'tokens.json')
}
