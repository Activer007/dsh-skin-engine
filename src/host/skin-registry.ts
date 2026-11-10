import { createHash } from 'node:crypto'
import { opendir, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { checkSkinCompatibility, parseSkinManifest, type SkinManifest } from '../core/manifest.js'
import { SkinValidationError } from '../core/validation.js'
import { builtInSkinDirectories } from './built-in-skins.js'
import { bundledPreferences, installedDirectory, INSTALLED_ROOT, readSkinData, validateSceneArtwork } from './installed-package.js'
import {
  checkedLocation, checkedProfile, FILE_LIMIT, fsErrorCode, MANIFEST_LIMIT, PackageFileError, parseJson, readPackageFile, utf8,
  type PackageLocation,
} from './package-files.js'
import { readPackageVersions, versionLocation, type PackageVersions } from './package-versions.js'
import { resourceType } from './resource-type.js'
import { validateSkinCss } from './skin-css.js'

const LOCAL_ROOT = ['skin-engine', 'packages'] as const
const MAX_LOCAL_ENTRIES = 256

interface CatalogueIssue {
  source: PackageLocation['source']
  directory: string
  code: string
  id?: string
  root?: true
}

interface IndexedSkin {
  location: PackageLocation
  installation?: PackageLocation
  versions?: PackageVersions | null
  previousVersion?: string
  manifest: SkinManifest
  manifestHash: string
  revision: string
  compatibility: ReturnType<typeof checkSkinCompatibility>
}

interface Catalogue {
  skins: Map<string, IndexedSkin>
  issues: CatalogueIssue[]
  localCount: number
}

function digest(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function skinRevision(location: PackageLocation, manifestHash: string, generation?: string) {
  const revision = [location.anchor, location.source, location.segments.at(-1)!, manifestHash]
  if (generation) revision.push(generation)
  return digest(JSON.stringify(revision))
}

async function localLocations(profile: string, segments: readonly string[], managed: boolean, signal: AbortSignal,
  budget: { count: number }): Promise<PackageLocation[]> {
  const root = await checkedLocation(profile, segments)
  const directories = []
  for await (const entry of await opendir(root.path)) {
    signal.throwIfAborted()
    if (++budget.count > MAX_LOCAL_ENTRIES) throw new PackageFileError('too-many-entries', 413)
    if (entry.name.startsWith('.')) continue
    if (managed && !installedDirectory.test(entry.name)) continue
    if (entry.isDirectory() || entry.isSymbolicLink()) directories.push(entry.name)
  }
  return directories.sort().map(directory => ({ anchor: profile, segments: [...segments, directory], source: 'local', managed }))
}

export function createSkinRegistry(
  profileDirectory: string,
  dshVersion: () => Promise<string | undefined>,
  lifetime: AbortSignal,
) {
  let current: Catalogue | undefined
  let scanning: Promise<Catalogue> | undefined

  async function scan(): Promise<Catalogue> {
    lifetime.throwIfAborted()
    const profile = await checkedProfile(profileDirectory)
    const version = await dshVersion()
    const issues: CatalogueIssue[] = []
    const skins = new Map<string, IndexedSkin>()
    const duplicates = new Set<string>()
    const locations: PackageLocation[] = []
    try {
      const builtIns = await realpath(fileURLToPath(new URL('./skins/', import.meta.url)))
      for (const name of builtInSkinDirectories) {
        locations.push({ anchor: builtIns, segments: [name], source: 'built-in' })
      }
    } catch (error) {
      issues.push({ source: 'built-in', directory: '', code: fsErrorCode(error) === 'ENOENT' ? 'missing-directory' : 'unreadable-directory' })
    }
    const budget = { count: 0 }
    for (const segments of [LOCAL_ROOT, INSTALLED_ROOT]) {
      try {
        locations.push(...await localLocations(profile, segments, segments === INSTALLED_ROOT, lifetime, budget))
      } catch (error) {
        lifetime.throwIfAborted()
        if (fsErrorCode(error) !== 'ENOENT') {
          issues.push({ source: 'local', directory: segments.at(-1)!, root: true,
            code: error instanceof PackageFileError ? error.code : 'unreadable-directory' })
        }
      }
    }

    for (const directoryLocation of locations) {
      lifetime.throwIfAborted()
      const directory = directoryLocation.segments.at(-1)!
      try {
        const installation = directoryLocation.managed ? directoryLocation : undefined
        const versions = installation && await readPackageVersions(installation, lifetime)
        const location = versionLocation(directoryLocation, versions?.current)
        const bytes = await readPackageFile(location, 'skin.json', MANIFEST_LIMIT, lifetime)
        const manifest = parseSkinManifest(parseJson(bytes))
        const previous = skins.get(manifest.id)
        if (previous || duplicates.has(manifest.id)) {
          issues.push({ source: location.source, directory, id: manifest.id, code: 'duplicate-id' })
          // A local collision cannot displace an engine-supplied ID. Local/local collisions quarantine both.
          if (previous && previous.location.source === location.source) {
            issues.push({ source: previous.location.source, directory: (previous.installation ?? previous.location).segments.at(-1)!,
              id: manifest.id, code: 'duplicate-id' })
            skins.delete(manifest.id)
            duplicates.add(manifest.id)
          }
          continue
        }
        let previousVersion: string | undefined
        if (versions?.previous && installation) {
          try {
            const previous = await readPackageFile(versionLocation(installation, versions.previous), 'skin.json', MANIFEST_LIMIT, lifetime)
            const candidate = parseSkinManifest(parseJson(previous))
            if (candidate.id === manifest.id && !checkSkinCompatibility(candidate, version)) previousVersion = candidate.version
          } catch { lifetime.throwIfAborted() }
        }
        const manifestHash = digest(bytes)
        skins.set(manifest.id, {
          location, installation, versions, previousVersion,
          manifest,
          manifestHash,
          revision: skinRevision({ ...directoryLocation, anchor: profile }, manifestHash, versions?.generation),
          compatibility: checkSkinCompatibility(manifest, version),
        })
      } catch (error) {
        lifetime.throwIfAborted()
        const code = error instanceof SkinValidationError ? 'invalid-manifest'
          : error instanceof PackageFileError ? error.code
          : fsErrorCode(error) === 'ENOENT' ? 'missing-manifest' : 'unreadable-manifest'
        issues.push({ source: directoryLocation.source, directory, code })
      }
    }
    return { skins, issues, localCount: budget.count }
  }

  async function index(signal: AbortSignal, refresh = false): Promise<Catalogue> {
    signal.throwIfAborted()
    if (!scanning && (!current || refresh)) {
      scanning = scan().then(result => (current = result)).finally(() => { scanning = undefined })
    }
    const result = scanning ? await scanning : current!
    signal.throwIfAborted()
    return result
  }

  async function resolveSkin(id: string, revision: string, signal: AbortSignal): Promise<IndexedSkin> {
    const skin = (await index(signal)).skins.get(id)
    if (!skin || skin.revision !== revision) throw new PackageFileError('skin-not-found', 404)
    if (skin.installation) {
      const versions = await readPackageVersions(skin.installation, signal)
      if (versions?.generation !== skin.versions?.generation) throw new PackageFileError('skin-changed', 409)
    }
    const bytes = await readPackageFile(skin.location, 'skin.json', MANIFEST_LIMIT, signal)
    if (digest(bytes) !== skin.manifestHash) throw new PackageFileError('skin-changed', 409)
    return skin
  }

  return {
    async requireCompatibility(manifest: SkinManifest) {
      const issue = checkSkinCompatibility(manifest, await dshVersion())
      if (issue) throw new PackageFileError(issue.code, 409)
    },
    async catalogue(signal: AbortSignal, fresh = false) {
      if (fresh && scanning) await scanning
      const { skins, issues, localCount } = await index(signal, true)
      return { skins: [...skins.values()], issues, localCount, localLimit: MAX_LOCAL_ENTRIES }
    },
    resolveSkin,
    async load(id: string, revision: string, signal: AbortSignal) {
      const skin = await resolveSkin(id, revision, signal)
      if (skin.compatibility) throw new PackageFileError(skin.compatibility.code, 409)
      const { location, manifest } = skin
      const { parsed, files } = await readSkinData(location, manifest, signal)
      if (parsed.scene) await validateSceneArtwork(location, parsed.scene, signal)
      const base = { ...parsed, css: location.source === 'built-in' ? utf8(files.css) : null,
        source: location.source, managed: Boolean(location.managed) }
      if (!location.managed) {
        const art = parsed.scene || (base.css && manifest.assets?.length)
          ? validateSkinCss(base.css ?? utf8(files.css), manifest).art : undefined
        return { ...base, art }
      }
      const { art, colors } = validateSkinCss(utf8(files.css), manifest)
      return {
        ...base, tokens: { ...base.tokens, colors: { ...colors, ...base.tokens.colors } }, art,
        bundledPreferences: await bundledPreferences(location, parsed, signal),
      }
    },
    async asset(id: string, revision: string, selector: { path: string } | { scheme: 'light' | 'dark' }, signal: AbortSignal) {
      const { location, manifest } = await resolveSkin(id, revision, signal)
      const path = 'path' in selector ? manifest.assets?.find(path => path === selector.path) : manifest.preview?.[selector.scheme]
      if (!path) {
        if ('scheme' in selector) return undefined
        throw new PackageFileError('asset-not-found', 404)
      }
      try {
        const bytes = await readPackageFile(location, path, FILE_LIMIT, signal)
        return { bytes, type: resourceType(path, bytes) }
      } catch (error) {
        if ('scheme' in selector && (error instanceof PackageFileError || fsErrorCode(error) === 'ENOENT')) return undefined
        throw error
      }
    },
  }
}
