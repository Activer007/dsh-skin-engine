type Bounds = readonly [minimum: number, maximum: number, initial: number]

interface EffectDescriptor {
  group: 'group.environment' | 'group.materials' | 'group.interaction'
  strength: {
    parameter: string
    bounds: Bounds
    measure: 'blur' | 'radius'
  }
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
} as const satisfies Record<string, EffectDescriptor>

export function describeEffect(id: string): EffectDescriptor | undefined {
  return Object.hasOwn(effectDescriptors, id) ? effectDescriptors[id as keyof typeof effectDescriptors] : undefined
}

export function normalizeEffectValue(value: number, [minimum, maximum]: Bounds) {
  return (value - minimum) / (maximum - minimum)
}

export function expandEffectValue(value: number, [minimum, maximum]: Bounds) {
  const scaled = value * (maximum - minimum)
  return minimum === 0 ? scaled : minimum + scaled
}
