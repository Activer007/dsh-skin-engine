import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const engineVersion = JSON.stringify(packageJson.version)
async function publicImage(name) {
  const bytes = await readFile(new URL(`src/client/${name}.svg`, root))
  const revision = createHash('sha1').update(bytes).digest('hex').slice(0, 12)
  const file = `${name}-${revision}.svg`
  return { bytes, file, path: `plugins/${packageJson.name}/assets/${file}` }
}
const [probe, placeholder] = await Promise.all(['probe', 'preview-placeholder'].map(publicImage))
const [effectsStyles, managerStyles] = await Promise.all(['src/client/effects/p0.css', 'src/client/skin-panel.css']
  .map(path => readFile(new URL(path, root), 'utf8')))

await mkdir(new URL('lib/assets/', root), { recursive: true })
const [host, client] = await Promise.all([
  build({
    absWorkingDir: fileURLToPath(root),
    entryPoints: ['src/host/index.ts'],
    outfile: 'lib/host.js',
    bundle: true,
    metafile: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    banner: { js: "import { createRequire as createBundleRequire } from 'node:module'; const require = createBundleRequire(import.meta.url);" },
    define: {
      SKIN_ENGINE_VERSION: engineVersion,
      PREVIEW_PLACEHOLDER_PATH: JSON.stringify(placeholder.path),
      PREVIEW_PLACEHOLDER_SVG: JSON.stringify(placeholder.bytes.toString('utf8')),
    },
  }),
  build({
    absWorkingDir: fileURLToPath(root),
    entryPoints: ['src/client/index.tsx'],
    outfile: 'lib/client.js',
    bundle: true,
    metafile: true,
    external: ['react', 'react/jsx-runtime'],
    format: 'cjs',
    jsx: 'automatic',
    target: 'es2022',
    define: {
      SKIN_ENGINE_VERSION: engineVersion,
      CSS_EFFECTS_STYLES: JSON.stringify(effectsStyles),
      MANAGER_STYLES: JSON.stringify(managerStyles),
    },
    banner: {
      js: `globalThis.__ModuleLoader__.load({ id: ${JSON.stringify(packageJson.name)}, factory(require) { const module = { exports: {} }; const PROBE_ASSET = require.asset(${JSON.stringify(probe.path)});`,
    },
    footer: { js: 'return module.exports; } });' },
  }),
  build({
    absWorkingDir: fileURLToPath(root),
    entryPoints: ['src/host/authoring.ts'],
    outfile: 'lib/authoring.js',
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
  }),
  ...[probe, placeholder].map(asset => writeFile(new URL(`lib/assets/${asset.file}`, root), asset.bytes)),
])

const dependencyRoots = new Set()
for (const { metafile } of [host, client]) {
  for (const output of Object.values(metafile.outputs)) {
    for (const [input, { bytesInOutput }] of Object.entries(output.inputs)) {
      const path = input.replaceAll('\\', '/')
      const index = path.lastIndexOf('node_modules/')
      if (!bytesInOutput || index < 0) continue
      const packagePath = /^node_modules\/(?:@[^/]+\/)?[^/]+/.exec(path.slice(index))?.[0]
      if (packagePath) dependencyRoots.add(path.slice(0, index) + packagePath)
    }
  }
}
const notices = ['Third-party notices for the bundled DSH Skin Engine runtime']
for (const directory of [...dependencyRoots].sort()) {
  const packageRoot = new URL(directory + '/', root)
  const { name, version, license } = JSON.parse(await readFile(new URL('package.json', packageRoot), 'utf8'))
  const files = (await readdir(packageRoot)).filter(file => /^(?:licen[cs]e|copying|notice)(?:\..+)?$/i.test(file)).sort()
  if (!files.length) throw new Error(`Missing license or notice file for ${name}@${version}`)
  notices.push(`${name}@${version} (${license})`)
  for (const file of files) notices.push((await readFile(new URL(file, packageRoot), 'utf8')).trim())
}
await writeFile(new URL('lib/THIRD-PARTY-NOTICES.txt', root), notices.join('\n\n') + '\n')

const { builtInSkinDirectories, checkSkinCompatibility, parseSkinManifest, readBuiltInSkins } = await import('../lib/host.js')
const sourceSkins = new URL('DSH_Skin_Engine_Development_Pack_v1.0/examples/skins/', root)
await Promise.all(builtInSkinDirectories.map(async directory => {
  const source = new URL(`${directory}/`, sourceSkins)
  const destination = new URL(`lib/skins/${directory}/`, root)
  const manifest = parseSkinManifest(JSON.parse(await readFile(new URL('skin.json', source), 'utf8')))
  const files = new Set(['skin.json', ...Object.values(manifest.entry), ...Object.values(manifest.preview ?? {}), ...manifest.assets ?? []])
  await Promise.all([...files].map(async filename => {
    await mkdir(new URL(posix.dirname(filename) + '/', destination), { recursive: true })
    await copyFile(new URL(filename, source), new URL(filename, destination))
  }))
}))
for (const { manifest, diagnostics } of await readBuiltInSkins()) {
  const problem = checkSkinCompatibility(manifest, packageJson.engines.dsh) ?? diagnostics[0]
  if (problem) throw new Error(`${manifest.id}: ${problem.message}`)
}
