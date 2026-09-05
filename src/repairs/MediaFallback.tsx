import { useState } from 'react'
import { Icon } from '../ui'
import { isTauri } from './repo'
import { ensurePlayable } from '../lib/transcode'
import type { Attachment } from './types'

/** Показывается, когда движок просмотра не смог открыть файл: даём сохранить и открыть снаружи. */
export function MediaFallback({ file, reason }: { file: Attachment; reason: string }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const convert = async () => {
    setBusy(true)
    try {
      await ensurePlayable(file)
      setNote('Файл подготовлен — обновите карточку')
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Конвертация недоступна')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fallback">
      <Icon name={file.kind === 'video' ? 'video' : 'image'} size={24} />
      <span className="fallback__title">{reason}</span>
      <span className="fallback__hint">
        {isTauri()
          ? 'Откройте файл во внешнем плеере — он лежит в папке приложения.'
          : 'Сохраните файл и откройте в системном плеере. В десктопной сборке такие записи будут конвертироваться автоматически.'}
      </span>
      <span className="fallback__acts">
        {file.kind === 'video' && (
          <button className="btn btn--sm" onClick={convert} disabled={busy}>
            <Icon name="refresh" size={13} />
            Подготовить к просмотру
          </button>
        )}
        <a className="btn btn--sm" href={file.src} download={file.fileName}>
          <Icon name="download" size={13} />
          Сохранить
        </a>
        <a className="btn btn--sm" href={file.src} target="_blank" rel="noreferrer">
          <Icon name="maximize" size={13} />
          Открыть отдельно
        </a>
      </span>
      {note && <span className="fallback__hint">{note}</span>}
    </div>
  )
}
