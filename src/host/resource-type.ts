import { extname } from 'node:path'
import { PackageFileError } from './package-files.js'

const pngMagic = Buffer.from('89504e470d0a1a0a', 'hex')
const pngEnd = Buffer.from('0000000049454e44ae426082', 'hex')
const jpegFrames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

function imageSize(width: number, height: number) {
  return width > 0 && height > 0 && width <= 4096 && height <= 4096 && width * height <= 8 * 1024 * 1024
}

function jpegSize(bytes: Buffer) {
  let index = 2
  while (index + 4 < bytes.length && bytes[index++] === 0xff) {
    while (bytes[index] === 0xff) index++
    if (index + 3 > bytes.length) return false
    const marker = bytes[index++]
    const size = bytes.readUInt16BE(index)
    if (size < 2 || index + size > bytes.length || marker === 0xda) return false
    if (jpegFrames.has(marker)) {
      return size >= 8 && imageSize(bytes.readUInt16BE(index + 5), bytes.readUInt16BE(index + 3))
    }
    index += size
  }
  return false
}

function webpSize(bytes: Buffer) {
  const chunkLength = bytes.readUInt32LE(16)
  if (chunkLength > bytes.length - 20) return false
  switch (bytes.toString('latin1', 12, 16)) {
    case 'VP8X':
      return chunkLength === 10 && imageSize(bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1)
    case 'VP8L':
      if (chunkLength < 5 || bytes[20] !== 0x2f) return false
      return imageSize((bytes.readUInt16LE(21) & 0x3fff) + 1, ((bytes.readUIntLE(22, 3) >>> 6) & 0x3fff) + 1)
    case 'VP8 ':
      if (chunkLength < 10 || bytes.readUIntBE(23, 3) !== 0x9d012a) return false
      return imageSize(bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff)
    default: return false
  }
}

export function resourceType(path: string, bytes: Buffer): string {
  switch (extname(path).toLowerCase()) {
    case '.png':
      if (bytes.length >= 45 && bytes.subarray(0, 8).equals(pngMagic)
        && bytes.readUInt32BE(8) === 13 && bytes.toString('latin1', 12, 16) === 'IHDR'
        && imageSize(bytes.readUInt32BE(16), bytes.readUInt32BE(20))
        && bytes.subarray(-12).equals(pngEnd)) return 'image/png'
      break
    case '.jpg':
    case '.jpeg':
      if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
        && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9 && jpegSize(bytes)) return 'image/jpeg'
      break
    case '.webp':
      if (bytes.length >= 20 && bytes.toString('latin1', 0, 4) === 'RIFF'
        && bytes.readUInt32LE(4) === bytes.length - 8 && bytes.toString('latin1', 8, 12) === 'WEBP'
        && webpSize(bytes)) return 'image/webp'
      break
    case '.woff2':
      if (bytes.length >= 48 && bytes.toString('latin1', 0, 4) === 'wOF2'
        && bytes.readUInt32BE(8) === bytes.length && bytes.readUInt16BE(12) > 0
        && bytes.readUInt32BE(16) <= 16 * 1024 * 1024) return 'font/woff2'
      break
  }
  throw new PackageFileError('invalid-resource-type', 415)
}
