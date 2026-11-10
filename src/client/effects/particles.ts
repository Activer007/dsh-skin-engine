export function createParticles(count: number) {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    depth: Math.random(),
    phase: Math.random() * 2 * Math.PI,
  }))
}
