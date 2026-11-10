import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rename, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Readable } from 'node:stream'
import { ZipFile } from 'yazl'
import { gt } from 'semver'
import { parseSkinManifest, skinIdSchema, type SkinManifest } from '../core/manifest.js'
import { SkinValidationError } from '../core/validation.js'
import { preferencesFor } from '../shared/preferences.js'
import { EXPORT_SKIN_PATH, REMOVE_SKIN_PATH, ROLLBACK_SKIN_PATH, ZIP_BYTES, type PackageTarget } from '../shared/skins.js'
import type { Register } from './catalogue-routes.js'
import { BUNDLE_PREFERENCES, BUNDLE_PREFERENCES_SCHEMA, installedDirectory, INSTALLED_ROOT,
  packageResources, readSkinData, STAGING_ROOT, validatePackageContents } from './installed-package.js'
import { checkedLocation, ensurePackageDirectory, FILE_LIMIT, fsErrorCode, MANIFEST_LIMIT, PackageFileError,
  parseJson, readPackageFile, utf8, type PackageLocation } from './package-files.js'
import { registerUploadRoute } from './package-upload.js'
import { commitPackageVersion, stagePackageVersion, versionLocation } from './package-versions.js'
import { resourceType } from './resource-type.js'
import { validateSkinCss } from './skin-css.js'
import { skinRevision, type createSkinRegistry } from './skin-registry.js'
import type { createSelectionStore } from './skin-selection.js'
import { EXPANDED_BYTES } from './zip-archive.js'

const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const jsonBytes = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n')

function packageQuery(request: Request, options: string[] = []) {
  const query = new URL(request.url).searchParams
  const parsed = skinIdSchema.safeParse(query.get('id'))
  const revision = query.get('revision')
  if (!parsed.success || !revision || !/^[0-9a-f]{64}$/.test(revision)
    || query.getAll('id').length !== 1 || query.getAll('revision').length !== 1
    || [...query.keys()].some(key => key !== 'id' && key !== 'revision'
      && (!options.includes(key) || query.getAll(key).length !== 1 || query.get(key) !== '1'))) {
    throw new PackageFileError('invalid-package-query', 400)
  }
  return { id: parsed.data, revision, query }
}

async function zipFiles(files: Map<string, Buffer>, signal: AbortSignal) {
  let expanded = 0
  for (const bytes of files.values()) expanded += bytes.length
  if (expanded > EXPANDED_BYTES) throw new PackageFileError('zip-expansion-limit', 413)
  const zip = new ZipFile()
  const output = zip.outputStream as Readable
  const cancel = () => { output.destroy() }
  zip.on('error', error => output.destroy(error))
  signal.addEventListener('abort', cancel, { once: true })
  try {
    signal.throwIfAborted()
    for (const [name, bytes] of files) zip.addBuffer(bytes, name, { compress: false })
    zip.end()
    const chunks: Buffer[] = []
    let length = 0
    for await (const chunk of output) {
      signal.throwIfAborted()
      length += chunk.length
      if (length > ZIP_BYTES) throw new PackageFileError('upload-size-limit', 413)
      chunks.push(chunk)
    }
    signal.throwIfAborted()
    return Buffer.concat(chunks, length)
  } finally {
    signal.removeEventListener('abort', cancel)
    output.destroy()
  }
}

export function registerPackageRoutes(register: Register, profileDirectory: string, registry: ReturnType<typeof createSkinRegistry>,
  transact: ReturnType<typeof createSelectionStore>, lifetime: AbortSignal) {
  async function packageVersionTarget(target: PackageTarget, signal: AbortSignal) {
    const catalogue = await registry.catalogue(signal, true)
    const skin = catalogue.skins.find(skin => skin.manifest.id === target.id)
    if (!skin?.installation) throw new PackageFileError('package-not-updatable', 409)
    if (skin.revision !== target.revision) throw new PackageFileError('skin-changed', 409)
    return { ...skin, installation: skin.installation }
  }

  const readManifest = (location: PackageLocation, signal: AbortSignal) =>
    readPackageFile(location, 'skin.json', MANIFEST_LIMIT, signal)

  function versionResult(installation: PackageLocation, manifest: SkinManifest, bytes: Buffer, generation: string) {
    return { skinId: manifest.id, version: manifest.version,
      revision: skinRevision(installation, createHash('sha256').update(bytes).digest('hex'), generation) }
  }

  const uploadDrain = registerUploadRoute(register, profileDirectory, lifetime, (manifest, contents, signal, target) =>
    transact(signal, async ({ profile }) => {
      if (target) {
        if (manifest.id !== target.id) throw new PackageFileError('package-id-mismatch', 409)
        const { installation, versions, manifest: installed } = await packageVersionTarget(target, signal)
        if (!gt(manifest.version, installed.version)) throw new PackageFileError('package-version-not-newer', 409)
        await registry.requireCompatibility(manifest)
        const bytes = await readManifest({ anchor: contents, segments: [], source: 'local' }, signal)
        const next = await stagePackageVersion(installation, versions ?? null, contents, signal)
        const committed = await commitPackageVersion(installation, next, versions?.current ?? 'base', signal)
        return versionResult(installation, manifest, bytes, committed.generation)
      }
      const catalogue = await registry.catalogue(signal, true)
      if (catalogue.skins.some(skin => skin.manifest.id === manifest.id) || catalogue.issues.some(issue => issue.id === manifest.id)) {
        throw new PackageFileError('duplicate-id', 409)
      }
      if (catalogue.localCount >= catalogue.localLimit) throw new PackageFileError('package-limit', 409)
      if (catalogue.issues.some(issue => issue.root)) {
        throw new PackageFileError('package-catalogue-unavailable', 503)
      }
      const directory = await ensurePackageDirectory(profile, INSTALLED_ROOT)
      signal.throwIfAborted()
      await rename(contents, join(directory, `skin-${randomUUID()}`))
    }))

  const inFlight = new Set<Promise<Response>>()
  function route(path: string, method: 'GET' | 'POST', serve: (request: Request, signal: AbortSignal) => Promise<Response>) {
    register({
      path: `/${path}`, methods: [method], requestBody: 'buffered',
      fetch(request) {
        const signal = AbortSignal.any([request.signal, lifetime])
        const result = serve(request, signal).catch(error => {
          let status = 503
          let code = 'package-operation-failed'
          if (signal.aborted) { status = 408; code = 'cancelled' }
          else if (error instanceof PackageFileError) { status = error.status; code = error.code }
          else if (error instanceof SkinValidationError) { status = 422; code = 'invalid-skin-data' }
          else if (fsErrorCode(error) === 'ENOENT') { status = 404; code = 'package-file-not-found' }
          else console.warn('[skin-engine] package operation failed', error)
          return Response.json({ error: code }, { status, headers })
        })
        inFlight.add(result)
        void result.then(() => inFlight.delete(result))
        return result
      },
    })
  }

  route(EXPORT_SKIN_PATH, 'GET', async (request, signal) => {
    const { id, revision, query } = packageQuery(request, ['assets', 'preferences'])
    const { location, manifest } = await registry.resolveSkin(id, revision, signal)
    if (location.source === 'local' && !location.managed) throw new PackageFileError('skin-unavailable', 409)
    const { parsed, files } = await readSkinData(location, manifest, signal)
    const css = validateSkinCss(utf8(files.css), manifest)
    const included = new Set<string>()
    const output = new Map([
      [manifest.entry.tokens, files.tokens],
      [manifest.entry.effects, files.effects],
      [manifest.entry.styles, Buffer.from(query.has('assets') ? files.css : css.publicCss)],
    ] as [string, Buffer][])
    const includeAssets = query.has('assets')
    const { scene, ...entries } = manifest.entry
    if (includeAssets && scene && files.scene) output.set(scene, files.scene)
    let total = files.tokens.length + files.effects.length + files.css.length + (includeAssets ? files.scene?.length ?? 0 : 0)
    if (includeAssets) {
      for (const path of packageResources(manifest)) {
        let bytes: Buffer
        try { bytes = await readPackageFile(location, path, FILE_LIMIT, signal) } catch (error) {
          if (location.source === 'built-in' && !manifest.assets?.includes(path) && fsErrorCode(error) === 'ENOENT') continue
          throw error
        }
        total += bytes.length
        if (total > EXPANDED_BYTES) throw new PackageFileError('zip-expansion-limit', 413)
        resourceType(path, bytes)
        output.set(path, bytes)
        included.add(path)
      }
    }
    const light = manifest.preview?.light
    const dark = manifest.preview?.dark
    output.set('skin.json', jsonBytes({
      ...manifest, entry: includeAssets ? manifest.entry : entries,
      capabilities: !includeAssets && scene ? manifest.capabilities.filter(capability => capability !== 'scene') : manifest.capabilities,
      assets: manifest.assets?.filter(path => included.has(path)),
      preview: { light: light && included.has(light) ? light : undefined, dark: dark && included.has(dark) ? dark : undefined },
    }))
    if (query.has('preferences')) {
      const values = await transact(signal, async ({ read }) => preferencesFor((await read()).preferences, id))
      if (values) {
        const effects = Object.fromEntries(Object.entries(values.effects ?? {})
          .filter(([effectId]) => parsed.effects.some(effect => effect.id === effectId)))
        output.set(BUNDLE_PREFERENCES, jsonBytes({
          schema: BUNDLE_PREFERENCES_SCHEMA, skinId: id,
          preferences: { ...values, effects: Object.keys(effects).length ? effects : undefined },
        }))
      }
    }
    const archive = await zipFiles(output, signal)
    return new Response(archive, { headers: {
      ...headers, 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${id}.dshskin.zip"`,
    } })
  })

  route(ROLLBACK_SKIN_PATH, 'POST', async (request, signal) => {
    const target = packageQuery(request)
    const result = await transact(signal, async () => {
      const { installation, versions } = await packageVersionTarget(target, signal)
      if (!versions?.previous) throw new PackageFileError('package-rollback-unavailable', 409)
      const location = versionLocation(installation, versions.previous)
      const bytes = await readManifest(location, signal)
      const manifest = parseSkinManifest(parseJson(bytes))
      if (manifest.id !== target.id) throw new PackageFileError('package-id-mismatch', 409)
      await registry.requireCompatibility(manifest)
      await validatePackageContents(location, manifest, signal)
      const committed = await commitPackageVersion(installation, versions.previous, null, signal)
      return versionResult(installation, manifest, bytes, committed.generation)
    })
    return Response.json(result, { headers })
  })

  route(REMOVE_SKIN_PATH, 'POST', async (request, signal) => {
    const { id, revision } = packageQuery(request)
    const trash = await transact(signal, async ({ profile, read, write }) => {
      const { installation } = await registry.resolveSkin(id, revision, signal)
      const directory = installation?.segments.at(-1)
      if (!directory || !installedDirectory.test(directory)) throw new PackageFileError('package-not-removable', 409)
      const current = await read()
      if (current.skinId === id) {
        if (current.revision === Number.MAX_SAFE_INTEGER) throw new PackageFileError('revision-exhausted', 409)
        const next = await write({ ...current, skinId: null, revision: current.revision + 1 })
        if (next.skinId !== null || next.revision !== current.revision + 1) {
          throw new PackageFileError('selection-write-failed', 503)
        }
      }
      const installed = await checkedLocation(profile, [...INSTALLED_ROOT, directory])
      const staging = await ensurePackageDirectory(profile, STAGING_ROOT)
      const target = await mkdtemp(join(staging, `upload-${process.pid}-`))
      try {
        signal.throwIfAborted()
        await rename(installed.path, join(target, 'removed'))
      } catch (error) {
        await rm(target, { force: true, recursive: true })
        throw error
      }
      return { staging, directory: basename(target) }
    })
    try {
      const target = await checkedLocation(trash.staging, [trash.directory])
      await rm(target.path, { force: true, recursive: true, maxRetries: 3, retryDelay: 50 })
    } catch (error) {
      console.warn('[skin-engine] package removed; staging cleanup deferred', error)
    }
    return Response.json({ removed: id }, { headers })
  })

  return () => Promise.allSettled([uploadDrain(), ...inFlight])
}
