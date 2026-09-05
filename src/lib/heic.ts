/** Фото с iPhone часто приходят в HEIC — движки просмотра его не рисуют, делаем JPEG-копию. */
export function isHeic(fileName: string, mime = ''): boolean {
  if (mime === 'image/heic' || mime === 'image/heif') return true
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return ext === 'heic' || ext === 'heif'
}

export async function heicToJpeg(file: File | Blob): Promise<Blob | null> {
  try {
    const heic2any = (await import('heic2any')).default
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
    return Array.isArray(out) ? out[0] : out
  } catch {
    return null
  }
}
