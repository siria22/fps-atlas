import type { AttachedImage } from '../../components/ImageUploadField.tsx'

/** 업로드 직전 상태: 미리보기 정보 + 본 이미지(긴 변 1600px) + 썸네일(480px), 모두 WebP. 원본은 보관하지 않는다. */
export type PreparedImage = { attached: AttachedImage; image: Blob; thumb: Blob }

async function compress(file: File, maxEdge: number, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('이미지를 처리할 수 없습니다.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('WebP 이미지 변환에 실패했습니다.'))), 'image/webp', quality),
  )
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일을 선택해 주세요.')
  if (file.size > 15 * 1024 * 1024) throw new Error('원본 이미지 크기는 15MB 이하여야 합니다.')
  const image = await compress(file, 1600)
  const thumb = await compress(file, 480, 0.75)
  if (image.size > 5 * 1024 * 1024 || thumb.size > 5 * 1024 * 1024) throw new Error('변환한 이미지가 5MB 제한을 넘습니다.')
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
