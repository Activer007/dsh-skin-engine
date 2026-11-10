import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const name = 'dsh-skin-token-audit-fixture'
export const event = 'dsh-skin-token-audit-fixture'
export const marker = 'data-dsh-skin-token-audit-fixture'
export const candidates = {
  '--dsw-alias-bg-layer-1': { light: '#f1e4d5', dark: '#382f26' },
  '--dsw-alias-bg-layer-2': { light: '#e6ecf4', dark: '#202e3e' },
  '--dsw-alias-bg-overlay': { light: '#e5e1f4', dark: '#342742' },
  '--dsw-alias-brand-primary': { light: '#aac8df', dark: '#35435d' },
  '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: '#844f81', dark: '#c78dc5' },
  '--dsw-alias-label-primary': { light: '#1a3540', dark: '#f4ddbf' },
  '--dsw-alias-label-secondary': { light: '#39505e', dark: '#ccd5b5' },
  '--dsw-specific-input-major': { light: '#f5ede2', dark: '#293a34' },
}
export const foreign = {
  '--dsw-alias-bg-base': { light: '#f1f4f6', dark: '#20262d' },
  '--dsw-alias-bg-layer-2': { light: '#e5e9ee', dark: '#303744' },
}

// This factory is serialized only into the disposable acceptance profile.
function client(name, event, marker, candidates, foreign) {
  globalThis.__ModuleLoader__.load({
    id: name,
    factory: () => ({
      inject: ['theme'],
      apply(ctx) {
        ctx.effect(() => {
          const root = document.documentElement
          const conflict = 'data-we-wallpaper'
          let release
          const inspect = ctx.theme.exportInspectTokens?.().map(item => item.name) ?? []
          function receive({ detail }) {
            if (detail === 'candidates' || detail === 'foreign') {
              release?.()
              release = ctx.theme.overrideTokens(name, detail === 'foreign' ? foreign : candidates)
            } else if (detail === 'release') {
              release?.()
              release = undefined
            } else if (detail === 'conflict') {
              document.body.setAttribute(conflict, name)
            } else if (detail === 'clear-conflict' && document.body.getAttribute(conflict) === name) {
              document.body.removeAttribute(conflict)
            } else return
            root.setAttribute(marker, detail)
          }
          root.setAttribute(marker, 'ready')
          root.setAttribute(marker + '-tokens', JSON.stringify(inspect))
          root.addEventListener(event, receive)
          return () => {
            root.removeEventListener(event, receive)
            root.removeAttribute(marker)
            root.removeAttribute(marker + '-tokens')
            release?.()
            if (document.body.getAttribute(conflict) === name) document.body.removeAttribute(conflict)
          }
        }, 'temporary semantic token audit')
      },
    }),
  })
}

export async function installTokenProbe(directory, installLocalBundle) {
  const fixture = join(directory, name)
  await mkdir(fixture)
  const manifest = {
    name, version: '0.0.0', private: true, type: 'module',
    exports: { '.': './index.mjs', './client': './client.js' },
    dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-ui-theme'] } },
  }
  await Promise.all([
    writeFile(join(fixture, 'package.json'), JSON.stringify(manifest)),
    writeFile(join(fixture, 'cordis.patch.yml'), '- insert:\n    - id: ' + name + '\n      name: ' + name + '\n'),
    writeFile(join(fixture, 'index.mjs'), 'export function apply() {}\n'),
    writeFile(join(fixture, 'client.js'), '(' + client.toString() + ')(...' + JSON.stringify([name, event, marker, candidates, foreign]) + ')\n'),
  ])
  installLocalBundle(fixture)
}
