import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { minVersion } from 'semver'
import { assetPaths, checkExactPaths, checkOutputFiles, checkReleaseAsset, examples, loadReleaseAssets,
  releaseSampleDirectories, sourceKey } from './release-assets.mjs'

const root = new URL('../', import.meta.url)
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const inventory = await loadReleaseAssets()
const seenAssets = new Set()
const engineVersion = JSON.stringify(packageJson.version)
async function publicImage(name) {
  const path = `src/client/${name}.svg`
  const bytes = Buffer.from((await readFile(new URL(path, root), 'utf8')).replaceAll('\r\n', '\n'))
  checkReleaseAsset(inventory, path, bytes)
  seenAssets.add(path)
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
    external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
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
const { readSkinSource, resourceType } = await import('../lib/authoring.js')
const sourceSkins = new URL(`${examples}/skins/`, root)
const builtFiles = new Set()
async function checkSkinAssets(relative, directory) {
  const { manifest, files } = await readSkinSource(directory)
  const sourceDirectory = fileURLToPath(new URL(`${examples}/${relative}/`, root))
  await checkExactPaths(sourceDirectory, files.keys())
  for (const path of assetPaths(manifest)) {
    const key = sourceKey(sourceDirectory, path)
    checkReleaseAsset(inventory, key, files.get(path), resourceType)
    seenAssets.add(key)
  }
}
await Promise.all(builtInSkinDirectories.map(async directory => {
  const source = new URL(`${directory}/`, sourceSkins)
  const destination = new URL(`lib/skins/${directory}/`, root)
  const manifest = parseSkinManifest(JSON.parse(await readFile(new URL('skin.json', source), 'utf8')))
  const files = new Set(['skin.json', ...Object.values(manifest.entry), ...assetPaths(manifest)])
  await Promise.all([...files].map(async filename => {
    builtFiles.add(`${directory}/${filename}`)
    await mkdir(new URL(posix.dirname(filename) + '/', destination), { recursive: true })
    await copyFile(new URL(filename, source), new URL(filename, destination))
  }))
  await checkSkinAssets(`skins/${directory}`, fileURLToPath(destination))
}))
for (const directory of releaseSampleDirectories) {
  await checkSkinAssets(directory, fileURLToPath(new URL(`${examples}/${directory}/`, root)))
}
for (const key of inventory.keys()) {
  if (!seenAssets.has(key)) throw Error(`Release asset is no longer referenced: ${key}`)
}
await checkOutputFiles(fileURLToPath(new URL('lib/assets/', root)), [probe.file, placeholder.file])
await checkOutputFiles(fileURLToPath(new URL('lib/skins/', root)), builtFiles)
for (const { manifest, diagnostics } of await readBuiltInSkins()) {
  const problem = checkSkinCompatibility(manifest, minVersion(packageJson.engines.dsh)?.version) ?? diagnostics[0]
  if (problem) throw new Error(`${manifest.id}: ${problem.message}`)
}
