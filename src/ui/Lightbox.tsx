import { useEffect } from 'react'
import { Icon } from './Icon'
import { MediaStamp } from '../repairs/MediaStamp'
import { VideoPlayer } from '../repairs/VideoPlayer'
import { SafeImage } from '../repairs/SafeImage'
import type { Attachment, Repair } from '../repairs/types'

export function Lightbox({
  items,
  index,
  repair,
  onIndex,
  onClose,
}: {
  items: Attachment[]
  index: number
  repair?: Repair | null
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const current = items[index]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndex((index + 1) % items.length)
      if (e.key === 'ArrowLeft') onIndex((index - 1 + items.length) % items.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, items.length, onIndex, onClose])

  if (!current) return null

  return (
    <div className="lb" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lb__bar">
        <span className="lb__name">{current.fileName}</span>
        <span className="lb__count">
          {index + 1} / {items.length}
        </span>
        <a className="lb__btn" href={current.src} download={current.fileName} title="Сохранить файл" aria-label="Сохранить файл">
          <Icon name="download" size={15} />
        </a>
        <button className="lb__btn" onClick={onClose} aria-label="Закрыть просмотр">
          <Icon name="x" size={17} />
        </button>
      </div>

      <div className="lb__stage">
        {current.kind === 'video' ? (
          <VideoPlayer file={current} repair={repair ?? null} stampSize="md" autoPlay className="lb__player" />
        ) : (
          <>
            <SafeImage file={current} />
            <MediaStamp repair={repair ?? null} at={current.addedAt} />
          </>
        )}
      </div>

      {items.length > 1 && (
        <>
          <button className="lb__nav lb__nav--prev" onClick={() => onIndex((index - 1 + items.length) % items.length)} aria-label="Предыдущий файл">
            <Icon name="chevronLeft" size={20} />
          </button>
          <button className="lb__nav lb__nav--next" onClick={() => onIndex((index + 1) % items.length)} aria-label="Следующий файл">
            <Icon name="chevronRight" size={20} />
          </button>
        </>
      )}
    </div>
  )
}
