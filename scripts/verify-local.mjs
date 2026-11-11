import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { platform, release } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { minVersion } from 'semver'

const [trust, commit, output = '.cache/local-verification', ...extra] = process.argv.slice(2)
assert(trust === 'trusted-commit' && /^[0-9a-f]{40}$/.test(commit ?? '') && !extra.length,
  'Usage: npm run verify:local -- trusted-commit <reviewed-full-SHA> [output-directory]')
assert(process.env.npm_execpath, 'Run through npm run verify:local')
assert.equal(process.versions.node.split('.')[0], '24', 'Use Node.js 24 for local verification')

const git = (args, cwd = process.cwd()) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim()
const repo = git(['rev-parse', '--show-toplevel'])
assert.equal(git(['rev-parse', '--verify', `${commit}^{commit}`], repo), commit, 'Expected an exact commit SHA')
mkdirSync(output, { recursive: true })
const directory = realpathSync(mkdtempSync(join(resolve(output), 'verify-')))
const report = {
  commit,
  tree: git(['rev-parse', `${commit}^{tree}`], repo),
  environment: { platform: platform(), release: release(), arch: process.arch, node: process.version },
  steps: [],
  passed: false,
}
const checkouts = []
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
const samples = ['skins/ink-focus', 'skins/warm-dusk', 'templates/starter']
const examples = 'DSH_Skin_Engine_Development_Pack_v1.0/examples'

function run(step, command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  const log = `${step}.log`
  writeFileSync(join(directory, log), [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n'))
  const passed = !result.error && result.status === 0
  report.steps.push({ step, passed, log })
  console.log(`${step}: ${passed ? 'PASS' : 'FAIL'}`)
  if (!passed) throw Error(`${step} failed. See ${join(directory, log)}`)
  return result.stdout.trim()
}

const npm = (step, args, cwd) => run(step, process.execPath, [process.env.npm_execpath, ...args], cwd)
const node = (step, args, cwd) => run(step, process.execPath, args, cwd)

function checkout(label) {
  const source = join(directory, `${label}-source`)
  git(['-c', 'core.autocrlf=false', '-c', 'core.eol=lf', 'worktree', 'add', '--detach', source, commit], repo)
  checkouts.push(source)
  assert.equal(git(['rev-parse', 'HEAD'], source), commit)
  assert.equal(git(['status', '--porcelain'], source), '')
  npm(`${label}-install`, ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], source)
  return source
}

async function packageFiles(label, source) {
  const output = join(directory, label)
  mkdirSync(output)
  const manifest = readJson(join(source, 'package.json'))
  const packed = JSON.parse(npm(`${label}-engine`, ['pack', '--json', '--pack-destination', output], source))
  // npm 12 keys pack results by package name. Older npm versions return a list.
  const pack = Array.isArray(packed) ? packed[0] : packed[manifest.name]
  assert(pack, `npm pack did not report ${manifest.name}`)
  assert.equal(pack.name, manifest.name)
  assert.equal(pack.version, manifest.version)
  const host = await import(pathToFileURL(join(source, 'lib/host.js')).href)
  const files = new Set([
    'package.json', 'cordis.patch.yml', 'lib/host.js', 'lib/client.js',
    'lib/THIRD-PARTY-NOTICES.txt', 'docs/release-asset-notes.md',
  ])
  const assets = readdirSync(join(source, 'lib/assets'))
  assert.equal(assets.length, 2)
  assert(assets.some(name => /^probe-[a-f0-9]{12}\.svg$/.test(name)))
  assert(assets.some(name => /^preview-placeholder-[a-f0-9]{12}\.svg$/.test(name)))
  for (const file of assets) files.add(`lib/assets/${file}`)
  for (const name of host.builtInSkinDirectories) {
    const prefix = `lib/skins/${name}`
    const skin = host.parseSkinManifest(readJson(join(source, prefix, 'skin.json')))
    for (const file of ['skin.json', ...Object.values(skin.entry), ...Object.values(skin.preview ?? {}), ...skin.assets ?? []]) {
      files.add(`${prefix}/${file}`)
    }
  }
  const archiveEntries = run(`${label}-contents`, 'tar', ['-tzf', join(output, pack.filename)], source).split(/\r?\n/).sort()
  assert.deepEqual(archiveEntries, [...files].map(file => `package/${file}`).sort(), 'Unexpected engine archive contents')
  const packedManifest = JSON.parse(run(`${label}-manifest`, 'tar',
    ['-xOzf', join(output, pack.filename), 'package/package.json'], source))
  assert.deepEqual(packedManifest, manifest)

  node(`${label}-samples`, ['scripts/pack-samples.mjs', output], source)
  const zipNames = host.builtInSkinDirectories.map(name => `${name}.dshskin.zip`)
  for (const sample of samples) {
    const path = join(examples, sample)
    node(`${label}-${sample.split('/').at(-1)}`, ['scripts/pack-samples.mjs', '--source', path, output], source)
    zipNames.push(`${readJson(join(source, path, 'skin.json')).id}.dshskin.zip`)
  }
  const names = readdirSync(output).sort()
  assert.deepEqual(names, [pack.filename, ...zipNames].sort())
  const artifacts = names.map(name => {
    const bytes = readFileSync(join(output, name))
    return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  })
  writeFileSync(join(output, 'SHA256SUMS.txt'), artifacts.map(({ name, sha256 }) => `${sha256}  ${name}`).join('\n') + '\n')
  assert.equal(git(['status', '--porcelain', '--untracked-files=no'], source), '', 'Build modified tracked source')
  return { engineVersion: manifest.version, hostVersion: minVersion(manifest.engines.dsh)?.version,
    hostVersionRange: manifest.engines.dsh, archiveEntries, artifacts }
}

console.log(`Local verification output: ${directory}`)
try {
  report.environment.npm = npm('npm-version', ['--version'], repo)
  const first = checkout('first')
  npm('typecheck', ['run', 'typecheck'], first)
  npm('lint', ['run', 'lint'], first)
  npm('test', ['test'], first)
  report.first = await packageFiles('first', first)
  report.rebuilt = await packageFiles('rebuilt', checkout('rebuilt'))
  assert.deepEqual(report.rebuilt, report.first, 'Independent checkouts produced different packages')
  report.passed = true
  console.log(`Verified ${report.first.artifacts.length} identical archives from ${commit}`)
} catch (error) {
  report.error = error.message
  console.error(error.message)
  process.exitCode = 1
} finally {
  for (const source of checkouts.reverse()) {
    try {
      assert.equal(dirname(realpathSync(source)), directory)
      git(['worktree', 'remove', '--force', source], repo)
    } catch (error) {
      report.passed = false
      report.cleanupError = error.message
      console.error(error.message)
      process.exitCode = 1
    }
  }
  writeFileSync(join(directory, 'result.json'), JSON.stringify(report, null, 2) + '\n')
}
