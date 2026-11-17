export function createParticles(count: number, random = Math.random) {
  return Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    depth: random(),
    phase: random() * 2 * Math.PI,
  }))
}
