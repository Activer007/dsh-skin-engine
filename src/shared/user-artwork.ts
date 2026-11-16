/** Stage 1 deliberately supports only the existing static portrait presets. */
export const portraitSkinIds = ['night-navigator', 'jade-archive',
  'blue-arc', 'dawn-station', 'moonlit-horizon', 'crimson-rain'].map(id => `com.dsh.skin.${id}`)
export const USER_ARTWORK_PATH = 'api/dsh-skin-engine/user-artwork'
export const USER_ARTWORK_IMAGE_PATH = USER_ARTWORK_PATH + '/image'
export const USER_ARTWORK_LIMIT = 5 * 1024 * 1024
export const artworkAssetPattern = /^[a-f0-9]{64}\.(png|jpg|webp)$/
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
