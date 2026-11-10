interface PaintLayer {
  node: HTMLElement
  width: number
  height: number
  request?: string
}

function gradient(id: string, color: string, x: number, y: number, rx: number, ry: number) {
  return `<radialGradient id="${id}" cx="0" cy="0" r="1" gradientTransform="translate(${x} ${y}) scale(${rx} ${ry})">
    <stop stop-color="${color}"/><stop offset=".95" stop-color="${color}" stop-opacity="0"/>
  </radialGradient>`
}

function auroraImage({ width, height }: PaintLayer, blur: number, near: string, far: string) {
  const padding = Math.ceil(blur * 3)
  const imageWidth = width + 2 * padding
  const imageHeight = height + 2 * padding
  const rect = (id: string) => `<rect x="${padding}" y="${padding}" width="${width}" height="${height}" fill="url(#${id})"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}">
    <defs>${gradient('near', near, .27, .31, .46, .34)}${gradient('far', far, .76, .72, .47, .41)}
      <filter id="blur" filterUnits="userSpaceOnUse" x="0" y="0" width="${imageWidth}" height="${imageHeight}" color-interpolation-filters="sRGB">
        <feGaussianBlur stdDeviation="${blur}"/>
      </filter>
    </defs><g filter="url(#blur)">${rect('far')}${rect('near')}</g>
  </svg>`
  return { padding, source: `data:image/svg+xml,${encodeURIComponent(svg)}` }
}

/** Keep the blur inside an image so the moving layer can reuse its painted pixels. */
export function mountAuroraPaint(view: Window & typeof globalThis, nodes: readonly HTMLElement[], near: string, far: string) {
  if (typeof view.ResizeObserver !== 'function' || typeof view.Image?.prototype.decode !== 'function') return
  const layers = new Map<Element, PaintLayer>(nodes.map(node => [node, { node, width: 0, height: 0 }]))
  let blur = 0

  function update(layer: PaintLayer) {
    const { node, width, height } = layer
    const request = blur > 0 && width > 0 && height > 0 ? `${width}x${height}:${blur}` : undefined
    if (layer.request === request) return
    layer.request = request
    node.removeAttribute('data-dsh-skin-aurora-image')
    node.style.removeProperty('--dsh-aurora-image')
    node.style.removeProperty('--dsh-aurora-padding')
    if (request === undefined) return

    const { padding, source } = auroraImage(layer, blur, near, far)
    const image = new view.Image()
    image.src = source
    // Keep the CSS gradient visible while the image decodes or if the host rejects it.
    void image.decode().then(() => {
      if (layer.request !== request) return
      node.style.setProperty('--dsh-aurora-padding', `${padding}px`)
      node.style.setProperty('--dsh-aurora-image', `url("${source}")`)
      node.setAttribute('data-dsh-skin-aurora-image', '')
    }, () => {})
  }

  const observer = new view.ResizeObserver(entries => {
    for (const entry of entries) {
      const layer = layers.get(entry.target)!
      layer.width = entry.contentRect.width
      layer.height = entry.contentRect.height
      update(layer)
    }
  })
  for (const node of nodes) observer.observe(node)

  function configure(radius: number) {
    if (blur === radius) return
    blur = radius
    for (const layer of layers.values()) update(layer)
  }

  return {
    configure,
    dispose() {
      observer.disconnect()
      configure(0)
    },
  }
}
