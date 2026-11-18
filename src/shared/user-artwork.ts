import type { SkinManifest } from '../core/manifest.js'

const legacyPortraitSkinIds = ['night-navigator', 'jade-archive',
  'blue-arc', 'dawn-station', 'moonlit-horizon', 'crimson-rain'].map(id => `com.dsh.skin.${id}`)

export function supportsUserArtwork({ manifest, source, managed }: {
  manifest: Pick<SkinManifest, 'id' | 'customizable'>
  source: 'built-in' | 'local'
  managed?: boolean
}): boolean {
  if (source === 'built-in' && legacyPortraitSkinIds.includes(manifest.id)) return true
  return (source === 'built-in' || managed === true) && manifest.customizable?.artwork.slot === 'primary'
}
export const USER_ARTWORK_PATH = 'api/dsh-skin-engine/user-artwork'
export const USER_ARTWORK_IMAGE_PATH = USER_ARTWORK_PATH + '/image'
export const USER_ARTWORK_LIBRARY_PATH = USER_ARTWORK_PATH + '/library'
export const USER_ARTWORK_REMOVE_PATH = USER_ARTWORK_PATH + '/remove'
export const USER_ARTWORK_LIMIT = 5 * 1024 * 1024
export const USER_ARTWORK_COUNT_LIMIT = 32
export const artworkAssetPattern = /^[a-f0-9]{64}\.(png|jpg|webp)$/

export interface UserArtworkLibrary {
  count: number
  bytes: number
  limit: number
  images: { asset: string; bytes: number; references: string[] }[]
}
export interface ArtworkPreference {
  asset: string
  fit: 'contain' | 'cover'
  x: number
  y: number
  scale: number
  opacity: number
}
export const artworkDefaults = { fit: 'contain', x: 50, y: 50, scale: 1, opacity: 0.35 } as const
export function sameArtwork(a?: ArtworkPreference, b?: ArtworkPreference) {
  return a?.asset === b?.asset && a?.fit === b?.fit && a?.x === b?.x && a?.y === b?.y
    && a?.scale === b?.scale && a?.opacity === b?.opacity
}
export function artworkUrl(asset: string) {
  return `${USER_ARTWORK_IMAGE_PATH}?asset=${encodeURIComponent(asset)}`
}
