import exifr from 'exifr'

export const MAX_PHOTO_DIM = 2560
export const MAX_THUMB_DIM = 400
const PHOTO_QUALITY = 0.85
const THUMB_QUALITY = 0.75

export interface ProcessedPhoto {
  file: Blob
  thumb: Blob
  width: number
  height: number
  takenAt?: number
}

export function scaleDimensions(width: number, height: number, max: number) {
  if (width <= max && height <= max) return { width, height }
  const ratio = max / Math.max(width, height)
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) }
}

export async function extractTakenAt(file: File): Promise<number | undefined> {
  try {
    const exif = (await exifr.parse(file, { pick: ['DateTimeOriginal'] })) as
      { DateTimeOriginal?: unknown } | undefined
    const d = exif?.DateTimeOriginal
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : undefined
  } catch {
    return undefined
  }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return img
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

function toJpeg(
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador')
  ctx.drawImage(source, 0, 0, width, height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao converter a foto'))),
      'image/jpeg',
      quality,
    )
  })
}

export async function processPhoto(original: File): Promise<ProcessedPhoto> {
  const takenAt = await extractTakenAt(original)
  const source = await decode(original)
  const srcWidth = 'naturalWidth' in source ? source.naturalWidth : source.width
  const srcHeight = 'naturalHeight' in source ? source.naturalHeight : source.height
  const dims = scaleDimensions(srcWidth, srcHeight, MAX_PHOTO_DIM)
  const thumbDims = scaleDimensions(srcWidth, srcHeight, MAX_THUMB_DIM)
  try {
    const [file, thumb] = await Promise.all([
      toJpeg(source, dims.width, dims.height, PHOTO_QUALITY),
      toJpeg(source, thumbDims.width, thumbDims.height, THUMB_QUALITY),
    ])
    return { file, thumb, width: dims.width, height: dims.height, takenAt }
  } finally {
    if ('close' in source) source.close()
  }
}
