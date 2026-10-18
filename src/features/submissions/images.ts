import type { AttachedImage } from '../../components/ImageUploadField.tsx'
import { ko, type MessageKey } from '../../i18n/messages.ts'

/** 화면 언어로 보여 줄 수 있게 문구 키를 함께 담은 오류 */
export class ImageError extends Error {
  constructor(readonly key: MessageKey) {
    super(ko[key])
  }
}

/** 업로드 직전 상태: 미리보기 정보 + 본 이미지(긴 변 1600px) + 썸네일(480px), 모두 WebP. 원본은 보관하지 않는다. */
export type PreparedImage = { attached: AttachedImage; image: Blob; thumb: Blob }

async function compress(file: File, maxEdge: number, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
  const context = canvas.getContext('2d')
  if (!context) throw new ImageError('image.err.process')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ImageError('image.err.webp'))), 'image/webp', quality),
  )
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new ImageError('image.err.type')
  if (file.size > 15 * 1024 * 1024) throw new ImageError('image.err.size')
  const image = await compress(file, 1600)
  const thumb = await compress(file, 480, 0.75)
  if (image.size > 5 * 1024 * 1024 || thumb.size > 5 * 1024 * 1024) throw new ImageError('image.err.limit')
  const previewUrl = URL.createObjectURL(image)
  const bitmap = await createImageBitmap(image)
  const attached = {
    fileName: `${file.name.replace(/\.[^.]+$/, '')}.webp`,
    width: bitmap.width,
    height: bitmap.height,
    bytes: image.size,
    previewUrl,
  }
  bitmap.close()
  return { attached, image, thumb }
}
