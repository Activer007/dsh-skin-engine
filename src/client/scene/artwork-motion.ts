import type { SceneSpec } from '../../core/scene.js'
import type { createFrameScheduler } from '../effects/frame-scheduler.js'
import { bindArtworkPointer } from '../effects/interaction.js'

type Motion = NonNullable<SceneSpec['layout']['artwork']['motion']>
type Offset = { x: number; y: number }
const PARALLAX = 'data-dsh-skin-artwork-parallax'
const LIGHT = 'data-dsh-skin-artwork-light'
const clampPointer = (value: number) => Math.max(-1, Math.min(1, value))

/** Preserve which image edges are clipped and keep the focal point inside the frame. */
export function limitArtworkTravel(max: number, frame: number, start: number, size: number, focal: number) {
  const end = start + size
  const focus = start + size * focal
  return Math.max(0, Math.min(max, Math.abs(start), Math.abs(frame - start),
    Math.abs(end), Math.abs(frame - end), focus - 12, frame - focus - 12))
}

export function mountArtworkMotion(node: HTMLElement, { parallax, ambientLight }: Motion,
  scheduler: ReturnType<typeof createFrameScheduler>) {
  const style = node.style
  let input: { surface: Element; travel: Offset; release: () => void } | undefined
  let pending: Offset | undefined
  let releaseFrame: (() => void) | undefined

  function flush() {
    releaseFrame?.()
    releaseFrame = undefined
    const next = pending
    pending = undefined
    if (!input || !next) return
    style.setProperty('--dsh-art-shift-x', `${(clampPointer(next.x) * input.travel.x).toFixed(2)}px`)
    style.setProperty('--dsh-art-shift-y', `${(clampPointer(next.y) * input.travel.y).toFixed(2)}px`)
  }

  function point(x: number, y: number) {
    pending = { x, y }
    releaseFrame ??= scheduler.add(flush)
  }

  function clearInput() {
    input?.release()
    releaseFrame?.()
    input = pending = releaseFrame = undefined
    node.removeAttribute(PARALLAX)
    style.removeProperty('--dsh-art-shift-x')
    style.removeProperty('--dsh-art-shift-y')
    style.removeProperty('--dsh-art-settle')
  }

  return function configure(surface?: Element, travel?: Offset) {
    if (surface && ambientLight && ambientLight.opacity > 0) {
      node.setAttribute(LIGHT, '')
      style.setProperty('--dsh-art-light-color', ambientLight.color)
      style.setProperty('--dsh-art-light-opacity', String(ambientLight.opacity))
    } else {
      node.removeAttribute(LIGHT)
      style.removeProperty('--dsh-art-light-color')
      style.removeProperty('--dsh-art-light-opacity')
    }

    if (input && input.surface === surface && input.travel.x === travel?.x && input.travel.y === travel.y) return
    if (input) clearInput()
    if (!surface || !travel || !(travel.x || travel.y) || !parallax) return
    input = { surface, travel, release: bindArtworkPointer(surface, point, () => point(0, 0)) }
    node.setAttribute(PARALLAX, '')
    style.setProperty('--dsh-art-settle', `${parallax.settleMs}ms`)
  }
}
