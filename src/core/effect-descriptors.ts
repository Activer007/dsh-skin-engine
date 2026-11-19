export type Bounds = readonly [minimum: number, maximum: number, initial: number]
type Measure = 'blur' | 'radius' | 'intensity' | 'density' | 'brightness' | 'distortion'
export const effectGroups = ['group.environment', 'group.materials', 'group.interaction'] as const
type Group = (typeof effectGroups)[number]
export type SecondaryEffectPreference = 'movement' | 'speed'
export interface SecondaryEffectControl {
  parameter: string
  bounds: Bounds
  label: `${'aurora' | 'curtain'}.${SecondaryEffectPreference}`
}

interface EffectDescriptor {
  group: Group
  strength: {
    parameter: string
    bounds: Bounds
    measure: Measure
    percentMinimum?: number
    percentMultiplier?: 'densityMultiplier'
  }
  variant?: {
    parameter: string
    equals: number | boolean
    label: 'effect.fixedStars' | 'effect.artworkLight'
    measure?: Measure
    percentMaximum?: number
  }
  secondary?: {
    whenDefined: string
    controls: Record<SecondaryEffectPreference, SecondaryEffectControl>
  }
  optIn?: true
  hint?: 'optionalWebgl'
}

export const effectDescriptors = {
  'glass.liquid': {
    group: 'group.materials',
    strength: { parameter: 'blur', bounds: [0, 24, 16], measure: 'blur' },
  },
  'interaction.ripple': {
    group: 'group.interaction',
    strength: { parameter: 'maxRadius', bounds: [80, 220, 120], measure: 'radius' },
  },
  'ambient.aurora': {
    group: 'group.environment',
    strength: { parameter: 'intensity', bounds: [0, 1, 0.45], measure: 'intensity' },
    secondary: {
      whenDefined: 'movement',
      controls: {
        movement: { parameter: 'movement', bounds: [0, 1, 0], label: 'aurora.movement' },
        speed: { parameter: 'speed', bounds: [0.1, 1, 0.25], label: 'aurora.speed' },
      },
    },
  },
  'ambient.aurora-curtain': {
    group: 'group.environment',
    strength: { parameter: 'intensity', bounds: [0, 1, 0.65], measure: 'intensity' },
    secondary: {
      whenDefined: 'foldAmplitude',
      controls: {
        movement: { parameter: 'foldAmplitude', bounds: [0, 1, 0.45], label: 'curtain.movement' },
        speed: { parameter: 'flowSpeed', bounds: [0.1, 1, 0.24], label: 'curtain.speed' },
      },
    },
  },
  'particles.dust': {
    group: 'group.environment',
    strength: { parameter: 'density', bounds: [0, 1, 0.35], measure: 'density', percentMultiplier: 'densityMultiplier' },
  },
  'particles.bubbles': {
    group: 'group.environment',
    strength: { parameter: 'density', bounds: [0, 1, 0.6], measure: 'density', percentMultiplier: 'densityMultiplier' },
  },
  'particles.starfield': {
    group: 'group.environment',
    strength: { parameter: 'brightness', bounds: [0, 1, 0.5], measure: 'brightness' },
    variant: { parameter: 'parallax', equals: 0, label: 'effect.fixedStars' },
  },
  'light.flow': {
    group: 'group.environment',
    strength: { parameter: 'intensity', bounds: [0, 1, 0.22], measure: 'intensity' },
  },
  'ambient.light': {
    group: 'group.environment',
    strength: { parameter: 'intensity', bounds: [0, 0.22, 0.14], measure: 'intensity' },
    variant: { parameter: 'illuminateArtwork', equals: true, label: 'effect.artworkLight', measure: 'brightness', percentMaximum: 200 },
  },
  'scene.brightness': {
    group: 'group.environment',
    strength: { parameter: 'level', bounds: [0.5, 1.5, 1], measure: 'brightness', percentMinimum: 50 },
  },
  'glass.holographic': {
    group: 'group.materials',
    strength: { parameter: 'intensity', bounds: [0, 1, 0.4], measure: 'intensity' },
  },
  'glass.refraction': {
    group: 'group.materials',
    strength: { parameter: 'distortion', bounds: [0, 1, 0.2], measure: 'distortion' },
    optIn: true,
    hint: 'optionalWebgl',
  },
} as const satisfies Record<string, EffectDescriptor>

export type EditableEffect = keyof typeof effectDescriptors
export const editableEffects = Object.keys(effectDescriptors) as EditableEffect[]

export function describeEffect(id: EditableEffect): EffectDescriptor {
  return effectDescriptors[id]
}

export function normalizeEffectValue(value: number, [minimum, maximum]: Bounds) {
  return (value - minimum) / (maximum - minimum)
}

export function expandEffectValue(value: number, [minimum, maximum]: Bounds) {
  const scaled = value * (maximum - minimum)
  return minimum === 0 ? scaled : minimum + scaled
}
