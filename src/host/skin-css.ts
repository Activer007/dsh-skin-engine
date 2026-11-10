import generate from 'css-tree/generator'
import parse from 'css-tree/parser'
import { isPackageImage, type SkinManifest } from '../core/manifest.js'
import type { parseSkinTokens } from '../core/tokens.js'
import type { SkinArtwork } from '../shared/skins.js'
import { MANIFEST_LIMIT, PackageFileError } from './package-files.js'

const colorProps = {
  '--dsh-skin-canvas': 'canvas',
  '--dsh-skin-surface': 'surface',
  '--dsh-skin-text': 'textPrimary',
  '--dsh-skin-accent': 'accent',
} as const

function reject(): never {
  throw new PackageFileError('unsafe-skin-css', 422)
}

export function validateSkinCss(source: string, manifest: SkinManifest) {
  if (Buffer.byteLength(source) > MANIFEST_LIMIT) throw new PackageFileError('skin-css-too-large', 413)
  if (/[\\\0]/.test(source)) reject()
  let tree: ReturnType<typeof parse>
  try {
    tree = parse(source, { parseCustomProperty: true, onParseError: reject })
  } catch { return reject() }
  if (tree.type !== 'StyleSheet') return reject()
  const root = `:root[data-dsh-skin-id="${manifest.id}"]`
  const artwork = `${root} [data-dsh-skin-package-art]`
  const colors: ReturnType<typeof parseSkinTokens>['colors'] = {}
  const art: SkinArtwork = { path: '', opacity: 0.2, size: 'cover' }
  const publicRules: string[] = []
  const seen = new Set<string>()
  for (const rule of tree.children) {
    if (rule.type !== 'Rule' || rule.prelude.type !== 'SelectorList') reject()
    const selector = generate(rule.prelude)
    if (selector !== root && (selector !== artwork || manifest.entry.scene)) reject()
    for (const declaration of rule.block.children) {
      if (declaration.type !== 'Declaration' || declaration.important || declaration.value.type !== 'Value') reject()
      const { property } = declaration
      const key = selector + ':' + property
      if (seen.has(key)) reject()
      seen.add(key)
      const parts = declaration.value.children.toArray()
      if (parts.length !== 1) reject()
      const [value] = parts
      if (selector === root) {
        if (Object.hasOwn(colorProps, property) && value.type === 'Hash' && /^(?:[a-f0-9]{3,4}|[a-f0-9]{6}|[a-f0-9]{8})$/i.test(value.value)) {
          colors[colorProps[property as keyof typeof colorProps]] = '#' + value.value
        } else if (property === '--dsh-skin-panel-radius'
          && ((value.type === 'Dimension' && value.unit === 'px' && /^\d+$/.test(value.value) && Number(value.value) <= 64)
            || (value.type === 'Number' && value.value === '0'))) {
          // Reserved for a future audited surface. The engine does not mount the CSS.
        } else if (property === 'color-scheme' && value.type === 'Identifier' && /^(?:dark|light)$/.test(value.name)) {
          // Appearance compatibility is determined by the Manifest.
        } else reject()
      } else if (property === 'background-image' && value.type === 'Url') {
        if (!manifest.assets?.includes(value.value) || !isPackageImage(value.value)) reject()
        art.path = value.value
      } else if (property === 'background-size' && value.type === 'Identifier'
        && (value.name === 'cover' || value.name === 'contain' || value.name === 'auto')) {
        art.size = value.name
      } else if (property === 'opacity' && value.type === 'Number' && /^(?:\d*\.)?\d+$/.test(value.value)
        && Number(value.value) <= 0.35) {
        art.opacity = Number(value.value)
      } else reject()
    }
    if (selector === root) publicRules.push(generate(rule))
  }
  return { colors, art: art.path ? art : undefined, publicCss: publicRules.join('\n') }
}
