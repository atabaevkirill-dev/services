import { useEffect, useRef, useState } from 'react'
import { MediaStamp } from './MediaStamp'
import { MediaFallback } from './MediaFallback'
import { mediaErrorText, videoMime, type Attachment, type Repair } from './types'

/**
 * Плеер пытается проиграть любой присланный файл — решение принимает движок,
 * а не список расширений. Не смог — показываем причину и пути открыть файл.
 */
export function VideoPlayer({
  file,
  repair,
  stampSize = 'sm',
  autoPlay = false,
  className = 'player__frame',
}: {
  file: Attachment
  repair: Repair | null
  stampSize?: 'sm' | 'md'
  autoPlay?: boolean
  className?: string
}) {
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => setError(null), [file.id, file.src])

  const fail = () => {
    const code = ref.current?.error?.code
    setError(mediaErrorText(code))
  }

  if (error) return <MediaFallback file={file} reason={error} />

  const mime = videoMime(file.fileName, file.mime)

  return (
    <div className={className}>
      <video
        ref={ref}
        controls
        playsInline
        preload="metadata"
        autoPlay={autoPlay}
        onError={fail}
        key={file.id}
      >
        {mime ? <source src={file.src} type={mime} /> : null}
        <source src={file.src} />
      </video>
      <MediaStamp repair={repair} at={file.addedAt} size={stampSize} />
    </div>
  )
}
