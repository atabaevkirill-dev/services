import { useEffect, useState } from 'react'
import { MediaFallback } from './MediaFallback'
import type { Attachment } from './types'

/** Фото с телефона может быть в HEIC — если движок его не рисует, показываем выход. */
export function SafeImage({ file, compact = false }: { file: Attachment; compact?: boolean }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [file.id, file.src])

  if (failed) {
    if (compact) return <span className="photo__none">{file.fileName.split('.').pop()?.toUpperCase()}</span>
    return <MediaFallback file={file} reason="Движок просмотра не отображает этот формат изображения" />
  }

  // HEIC показываем через JPEG-копию, если она сделана при импорте
  return <img src={file.preview || file.src} alt={file.caption ?? file.fileName} onError={() => setFailed(true)} />
}
