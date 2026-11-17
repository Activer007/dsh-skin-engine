import type { SceneSpec } from '../../core/scene.js'
import type { PreparedArtwork } from '../../shared/skins.js'
import type { createFrameScheduler } from '../effects/frame-scheduler.js'
import { limitArtworkTravel, mountArtworkMotion } from './artwork-motion.js'

type Bounds = Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom'>
type Size = { width: number; height: number }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high))
const alignment = { left: 0.25, top: 0.25, center: 0.5, right: 0.75, bottom: 0.75 } as const
const CONTENT_OPACITY = 0.16
const MOTION_MIN_WIDTH = 1000

export function layoutArtwork(layout: SceneSpec['layout'], viewport: Size, content: Bounds, composer: Bounds, image: Size) {
  const { artwork, breakpoints, safeArea } = layout
  const top = Math.max(content.top, 0)
  const height = Math.min(content.bottom, viewport.height) - top
  const start = Math.max(content.left, 0)
  const right = Math.min(content.right, viewport.width)
  const contentWidth = right - start
  const left = start + contentWidth * (safeArea?.contentLeftFraction ?? 0)
  const width = right - left
  if (width < 48 || height < 48 || image.width <= 0 || image.height <= 0) return

  const rule = breakpoints?.find(({ maxWidth }) => viewport.width <= maxWidth)
  const opacity = rule?.opacity ?? artwork.opacity
  if (opacity === 0) return
  const fit = artwork.fit === 'cover' ? Math.max : Math.min
  const ratio = fit(contentWidth / image.width, height / image.height) * (rule?.artworkScale ?? artwork.scale)
  const imageWidth = image.width * ratio
  const imageHeight = image.height * ratio
  const [horizontal, vertical] = artwork.anchor.split(' ') as [keyof typeof alignment, keyof typeof alignment]
  const [focalX, focalY] = artwork.focalPoint
  const imageX = width * alignment[horizontal] - imageWidth * focalX
  const imageY = height * alignment[vertical] - imageHeight * focalY
  const columnStart = clamp(composer.left - left - 8, 0, width)
  const columnEnd = clamp(composer.right - left + 8, 0, width)

  return {
    left, top, width, height, opacity,
    imageX, imageY, imageWidth, imageHeight,
    columnStart, columnEnd, columnAlpha: columnStart < columnEnd ? Math.min(1, CONTENT_OPACITY / opacity) : 1,
  }
}

interface ArtworkMount {
  update(visible: boolean, content?: Element, composer?: Element): boolean
  configureMotion?(surface?: Element, parallax?: boolean): void
  dispose(): void
}

export function mountArtwork(node: HTMLElement, artwork: PreparedArtwork, reconcile: () => void,
  scheduler?: ReturnType<typeof createFrameScheduler>): ArtworkMount {
  const { image } = artwork
  node.append(image)
  if (artwork.kind === 'legacy') {
    node.style.opacity = `calc(${artwork.style.opacity} * var(--dsh-skin-artwork-light, 1))`
    if (artwork.style.position) image.style.objectPosition = `${artwork.style.position[0]}% ${artwork.style.position[1]}%`
    if (artwork.style.scale) image.style.transform = `scale(${artwork.style.scale})`
    image.style.objectFit = artwork.style.size === 'auto' ? 'none' : artwork.style.size
    return { update: (visible: boolean) => visible, dispose: () => image.remove() }
  }

  const view = node.ownerDocument.defaultView!
  const { layout } = artwork
  const { motion } = layout.artwork
  const configure = motion && scheduler && mountArtworkMotion(node, motion, scheduler)
  let position: ReturnType<typeof layoutArtwork> | undefined
  node.setAttribute('data-dsh-skin-scene-artwork', '')
  node.toggleAttribute('data-dsh-skin-artwork-fade', !!layout.safeArea)
  const observer = new view.ResizeObserver(reconcile)
  let watchedContent: Element | undefined
  let watchedComposer: Element | undefined

  function watch(content?: Element, composer?: Element) {
    if (content === watchedContent && composer === watchedComposer) return
    observer.disconnect()
    watchedContent = content
    watchedComposer = composer
    if (content && composer) {
      observer.observe(node.ownerDocument.documentElement)
      observer.observe(content)
      observer.observe(composer)
    }
  }

  return {
    update(visible: boolean, content?: Element, composer?: Element) {
      watch(visible ? content : undefined, visible ? composer : undefined)
      const bounds = composer?.getBoundingClientRect()
      position = visible && content && bounds && bounds.width > 0 && bounds.height > 0
        ? layoutArtwork(layout, { width: view.innerWidth, height: view.innerHeight }, content.getBoundingClientRect(), bounds,
          { width: image.naturalWidth, height: image.naturalHeight })
        : undefined
      node.hidden = !position
      if (!position) return false
      const { left, top, width, height, opacity, imageX, imageY, imageWidth, imageHeight, columnStart, columnEnd, columnAlpha } = position
      Object.assign(node.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, opacity: String(opacity) })
      Object.assign(image.style, { left: `${imageX}px`, top: `${imageY}px`, width: `${imageWidth}px`, height: `${imageHeight}px` })
      node.style.setProperty('--dsh-art-content-start', `${columnStart}px`)
      node.style.setProperty('--dsh-art-content-end', `${columnEnd}px`)
      node.style.setProperty('--dsh-art-content-alpha', String(columnAlpha))
      return true
    },
    configureMotion(surface, parallax) {
      if (!configure) return
      if (!surface || !position || view.innerWidth < MOTION_MIN_WIDTH || position.width < 128 || position.height < 128) {
        configure()
        return
      }
      const limits = parallax && motion?.parallax
      const [focalX, focalY] = layout.artwork.focalPoint
      configure(surface, limits ? {
        x: limitArtworkTravel(limits.maxX, position.width, position.imageX, position.imageWidth, focalX),
        y: limitArtworkTravel(limits.maxY, position.height, position.imageY, position.imageHeight, focalY),
      } : undefined)
    },
    dispose() {
      configure?.()
      observer.disconnect()
      image.remove()
    },
  }
}
