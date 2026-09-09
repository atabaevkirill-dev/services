import { useEffect, useState } from 'react'
import { Icon } from '../ui'
import { MediaStamp } from './MediaStamp'
import { VideoPlayer } from './VideoPlayer'
import { SafeImage } from './SafeImage'
import { formatSize, type Attachment, type Repair } from './types'
import {
  loadBytes,
  decodeText,
  previewKindOf,
  readArchive,
  readDocx,
  readOdt,
  readRtf,
  readSheets,
  whyNotViewable,
  extOf,
  type ArchiveEntry,
  type SheetData,
} from '../lib/preview'

type Content =
  | { state: 'loading' }
  | { state: 'error'; message: string }
  | { state: 'sheet'; sheets: SheetData[] }
  | { state: 'rich'; html: string }
  | { state: 'text'; text: string }
  | { state: 'archive'; entries: ArchiveEntry[] }

/**
 * Показывает файл внутри приложения: фото, видео и PDF отдаёт движку,
 * остальное разбирает сам. Наружу файл уходит только там, где показать нечем.
 */
export function FileView({ file, repair, compact = false }: { file: Attachment; repair: Repair | null; compact?: boolean }) {
  const kind = previewKindOf(file)
  const needsParsing = kind === 'sheet' || kind === 'rich' || kind === 'text' || kind === 'archive'
  const [content, setContent] = useState<Content>({ state: 'loading' })

  useEffect(() => {
    if (!needsParsing) return
    let cancelled = false
    setContent({ state: 'loading' })

    const parse = async (): Promise<Content> => {
      const bytes = await loadBytes(file)
      if (kind === 'sheet') return { state: 'sheet', sheets: await readSheets(bytes, file.fileName) }
      if (kind === 'archive') return { state: 'archive', entries: await readArchive(bytes) }
      if (kind === 'text') return { state: 'text', text: decodeText(bytes) }
      const ext = extOf(file.fileName)
      if (ext === 'odt') return { state: 'rich', html: await readOdt(bytes) }
      if (ext === 'rtf') return { state: 'rich', html: readRtf(bytes) }
      return { state: 'rich', html: await readDocx(bytes) }
    }

    void parse()
      .then((next) => !cancelled && setContent(next))
      .catch((e) => !cancelled && setContent({ state: 'error', message: e instanceof Error ? e.message : 'Не удалось прочитать файл' }))

    return () => {
      cancelled = true
    }
  }, [file, kind, needsParsing])

  if (kind === 'image') {
    return (
      <div className="fv fv--media" data-compact={compact}>
        <SafeImage file={file} />
        <MediaStamp repair={repair} at={file.addedAt} />
      </div>
    )
  }

  if (kind === 'video') return <VideoPlayer file={file} repair={repair} />

  if (kind === 'pdf') {
    return <iframe className="fv__frame" data-compact={compact} src={file.src} title={file.fileName} />
  }

  if (kind === 'none') {
    return (
      <div className="fv__none">
        <Icon name="file" size={24} />
        <span>{whyNotViewable(file)}</span>
        <span className="doc__meta">Файл открывается системной программой — кнопка со стрелкой выше</span>
      </div>
    )
  }

  if (content.state === 'loading') return <div className="fv__note">Читаю файл…</div>
  if (content.state === 'error') {
    return (
      <div className="fv__none">
        <Icon name="alert" size={22} />
        <span>{content.message}</span>
        <span className="doc__meta">Откройте файл системной программой — кнопка со стрелкой выше</span>
      </div>
    )
  }

  if (content.state === 'sheet') return <SheetView sheets={content.sheets} compact={compact} />

  if (content.state === 'archive') {
    return (
      <div className="fv__list" data-compact={compact}>
        <div className="fv__listHead">В архиве {content.entries.length} файлов</div>
        {content.entries.map((entry) => (
          <div className="fv__listRow" key={entry.name}>
            <Icon name="file" size={13} />
            <span className="fv__listName">{entry.name}</span>
            <span className="doc__meta">{formatSize(entry.size)}</span>
          </div>
        ))}
      </div>
    )
  }

  if (content.state === 'text') {
    return (
      <pre className="fv__text" data-compact={compact}>
        {content.text}
      </pre>
    )
  }

  // разметка уже очищена в sanitizeHtml: остались только безопасные теги
  return <div className="fv__doc" data-compact={compact} dangerouslySetInnerHTML={{ __html: content.html }} />
}

/** Таблица с переключением листов — как в редакторе, ярлычки снизу. */
function SheetView({ sheets, compact }: { sheets: SheetData[]; compact: boolean }) {
  const [active, setActive] = useState(0)
  const sheet = sheets[Math.min(active, sheets.length - 1)]

  if (!sheet || sheet.rows.length === 0) return <div className="fv__note">Лист пуст</div>

  const [head, ...body] = sheet.rows

  return (
    <div className="fv__sheet" data-compact={compact}>
      <div className="fv__sheetScroll">
        <table className="fv__table">
          <thead>
            <tr>
              <th className="fv__rowNum" />
              {head.map((cell, i) => (
                <th key={i}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>
                <td className="fv__rowNum">{r + 2}</td>
                {head.map((_, c) => (
                  <td key={c}>{row[c] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fv__tabs">
        {sheets.map((s, i) => (
          <button key={s.name} className="chip chip--sm" data-on={i === active} onClick={() => setActive(i)}>
            {s.name}
          </button>
        ))}
        {sheet.truncated && <span className="doc__meta">показаны первые {sheet.rows.length} строк</span>}
      </div>
    </div>
  )
}
