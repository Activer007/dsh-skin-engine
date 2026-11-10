import type { createHolographic } from './holographic.js'
import type { createRipples } from './ripple.js'
import type { createStarfield } from './starfield.js'

const INTERACTIVE = 'a, button, input, textarea, select, label, summary, [contenteditable]:not([contenteditable="false"]),'
  + ' [role="button"], [role="link"], [role="dialog"], [role="menu"], [role="menuitem"], [role="listbox"], [role="textbox"]'
const ARTWORK_INPUT = INTERACTIVE + ', [data-composer-card]'

export function bindArtworkPointer(surface: Element, point: (x: number, y: number) => void, center: () => void) {
  const document = surface.ownerDocument
  const view = document.defaultView!
  const abort = new AbortController()
  const options = { passive: true, signal: abort.signal }
  surface.addEventListener('pointermove', event => {
    const { clientX, clientY, isPrimary, pointerType, isTrusted, target } = event as PointerEvent
    if (!isTrusted || !isPrimary || (pointerType !== 'mouse' && pointerType !== 'pen')
      || !(target instanceof view.Element) || target.closest(ARTWORK_INPUT) || document.getSelection()?.type === 'Range'
      || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return
    point(clientX * 2 / Math.max(1, view.innerWidth) - 1, clientY * 2 / Math.max(1, view.innerHeight) - 1)
  }, options)
  surface.addEventListener('pointerleave', center, options)
  surface.addEventListener('pointercancel', center, options)
  return () => abort.abort()
}

interface InputEffects {
  stars?: ReturnType<typeof createStarfield>
  parallax?: number
  ripples?: ReturnType<typeof createRipples>
  holo?: ReturnType<typeof createHolographic>
  syncCanvas(): void
}

/** Bind only to the currently audited surfaces. Return true when an old binding was removed. */
export function createEffectInput(document: Document, { stars, parallax, ripples, holo, syncCanvas }: InputEffects) {
  const view = document.defaultView!
  let input: { particles?: Element; glass?: Element; abort: AbortController } | undefined

  return (particles?: Element, glass?: Element) => {
    if (input?.particles === particles && input?.glass === glass) return false
    const replaced = input !== undefined
    input?.abort.abort()
    input = undefined
    stars?.resetPointer()
    ripples?.clear()
    holo?.reset()
    if (!particles && !glass) return replaced

    const abort = new AbortController()
    input = { particles, glass, abort }
    const passive = { passive: true, signal: abort.signal }
    if (particles && stars && parallax) {
      particles.addEventListener('pointermove', event => {
        const { clientX, clientY, isPrimary, pointerType } = event as PointerEvent
        if (!isPrimary || pointerType === 'touch') return
        stars.point(clientX * 2 / Math.max(1, view.innerWidth) - 1, clientY * 2 / Math.max(1, view.innerHeight) - 1)
        syncCanvas()
      }, passive)
      const recenter = () => { stars.point(0, 0); syncCanvas() }
      particles.addEventListener('pointerleave', recenter, passive)
      particles.addEventListener('pointercancel', recenter, passive)
    }
    if (particles && ripples) {
      particles.addEventListener('click', event => {
        const { button, clientX, clientY, detail, isTrusted, target, defaultPrevented } = event as MouseEvent
        if (!isTrusted || detail === 0 || button !== 0 || defaultPrevented
          || !(target instanceof view.Element) || target.closest(INTERACTIVE) || document.getSelection()?.type === 'Range') return
        ripples.add(clientX, clientY, view.performance.now())
        syncCanvas()
      }, passive)
    }
    if (glass && holo) {
      glass.addEventListener('pointermove', event => {
        const { clientX, clientY, isPrimary, pointerType } = event as PointerEvent
        if (isPrimary && pointerType !== 'touch') holo.point(clientX, clientY)
      }, passive)
      glass.addEventListener('pointerleave', holo.reset, passive)
      glass.addEventListener('pointercancel', holo.reset, passive)
    }
    return replaced
  }
}
