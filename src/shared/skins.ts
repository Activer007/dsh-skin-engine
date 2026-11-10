import type { SkinPreferences } from './preferences.js'

const ROOT = 'api/dsh-skin-engine'

export const SKINS_PATH = `${ROOT}/skins`
export const SKIN_PATH = `${ROOT}/skin`
export const SKIN_ASSET_PATH = `${ROOT}/asset`
export const SELECTION_PATH = `${ROOT}/selection`
export const APPLY_SKIN_PATH = `${SELECTION_PATH}/apply`
export const IMPORT_SKIN_PATH = `${ROOT}/packages/import`
export const UPDATE_SKIN_PATH = `${ROOT}/packages/update`
export const ROLLBACK_SKIN_PATH = `${ROOT}/packages/rollback`
export const EXPORT_SKIN_PATH = `${ROOT}/packages/export`
export const REMOVE_SKIN_PATH = `${ROOT}/packages/remove`
export const UPLOAD_CHUNK_BYTES = 512 * 1024
export const ZIP_BYTES = 21 * 1024 * 1024

export interface PackageTarget {
  id: string
  revision: string
}

export interface PackageVersionResult {
  skinId: string
  version: string
  revision: string
}

export interface SkinSelection {
  skinId: string | null
  revision: number
  preferences?: Record<string, SkinPreferences>
}

export interface SkinArtwork {
  path: string
  opacity: number
  size: 'cover' | 'contain' | 'auto'
}

export interface PreparedArtwork {
  image: HTMLImageElement
  style: SkinArtwork
}
