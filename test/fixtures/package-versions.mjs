import { buffer } from 'node:stream/consumers'
import { ZipFile } from 'yazl'

export const versionedSkin = { id: 'test.skin.upload', name: 'ZIP Skin' }

export function packageVersionPair(preview) {
  return Promise.all([
    pack('1.0.0', '#182431', [{ id: 'particles.dust', enabled: true, renderer: 'canvas2d', params: {} }], preview),
    pack('1.1.0', '#312418', [], preview),
  ])
}

function pack(version, canvas, effects, preview) {
  const zip = new ZipFile()
  const options = { compress: false, mtime: new Date('2026-01-01T00:00:00Z') }
  const entries = {
    'skin.json': {
      schema: 'dsh.skin/v1', ...versionedSkin, version, engineApi: '^1.0.0', colorScheme: 'dark',
      entry: { tokens: 'tokens.json', styles: 'theme.css', effects: 'effects.json' },
      capabilities: effects.length ? ['tokens', 'css', 'effects:canvas2d'] : ['tokens', 'css'],
    },
    'tokens.json': { schema: 'dsh.tokens/v1', colors: { canvas, surface: '#26272c', accent: '#91c9df' } },
    'effects.json': { schema: 'dsh.effects/v1', effects },
  }
  if (preview) {
    entries['skin.json'].capabilities.push('assets')
    entries['skin.json'].preview = { dark: 'preview/dark.png' }
    zip.addBuffer(preview, 'preview/dark.png', options)
  }
  for (const [name, data] of Object.entries(entries)) {
    zip.addBuffer(Buffer.from(JSON.stringify(data)), name, options)
  }
  zip.addBuffer(Buffer.from(`:root[data-dsh-skin-id="${versionedSkin.id}"] { color-scheme: dark; }`), 'theme.css', options)
  zip.end()
  return buffer(zip.outputStream)
}
