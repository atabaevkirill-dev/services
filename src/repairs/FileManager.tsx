import { useEffect, useMemo, useState } from 'react'
import { DropZone, FILE_ACCEPT, EmptyState, Icon, Lightbox, Modal } from '../ui'
import { useRepairs } from './store'

import { canRevealInFolder, copyLocation, openExternally, openFolder, revealInFolder, saveCopy } from '../lib/files'
import { MediaStamp } from './MediaStamp'
import { VideoPlayer } from './VideoPlayer'
import { SafeImage } from './SafeImage'
import { FileView } from './FileView'
import { useSettings } from '../settings/store'
import { useActOptions } from '../akt/options'
import { useActResult } from '../akt/result'
import { runAct } from '../akt/pipeline'
import { ActPanel, type ActState } from '../akt/ActPanel'
import {
  CATEGORY_LABEL,
  KIND_COLOR,
  KIND_LABEL,
  formatSize,
  type Attachment,
  type AttachmentCategory,
  type Repair,
} from './types'
import { formatDate } from '../lib/date'

type Scope = 'all' | AttachmentCategory
type SortKey = 'addedAt' | 'fileName' | 'size' | 'kind'
type View = 'list' | 'grid'

const SORT_LABEL: Record<SortKey, string> = {
  addedAt: 'По дате',
  fileName: 'По имени',
  size: 'По размеру',
  kind: 'По типу',
}

const SCOPE_ORDER: Scope[] = ['all', 'act', 'media', 'doc']
const iconFor = (f: Attachment) => (f.kind === 'video' ? 'video' : f.kind === 'image' ? 'image' : 'file')


function sortFiles(files: Attachment[], key: SortKey, dir: 'asc' | 'desc'): Attachment[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...files].sort((a, b) => {
    let cmp = 0
    if (key === 'size') cmp = a.size - b.size
    else if (key === 'addedAt') cmp = a.addedAt.localeCompare(b.addedAt)
    else if (key === 'fileName') cmp = a.fileName.localeCompare(b.fileName, 'ru', { numeric: true })
    else cmp = KIND_LABEL[a.kind].localeCompare(KIND_LABEL[b.kind], 'ru') || a.fileName.localeCompare(b.fileName, 'ru')
    return cmp * sign
  })
}

/**
 * Файловый менеджер заявки: разделы, поиск, сортировка, два режима показа,
 * просмотр выделенного файла и всё, что с файлом можно сделать — внутри карточки.
 */
export function FileManager({ repairId }: { repairId: number }) {
  const { files, addAttachment, removeAttachment, setCategory } = useRepairs()
  const repair = useRepairs((s) => s.items.find((r) => r.id === repairId) ?? null)

  const [scope, setScope] = useState<Scope>('all')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('addedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [view, setView] = useState<View>('list')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [checked, setChecked] = useState<number[]>([])
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [docView, setDocView] = useState<Attachment | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [akt, setAkt] = useState<ActState | null>(null)
  const settings = useSettings()
  const actOptions = useActOptions()
  const pendingAct = useActResult((s) => s.pending)
  const takeActResult = useActResult((s) => s.take)

  const counts = useMemo(() => {
    const map: Record<Scope, number> = { all: files.length, act: 0, media: 0, doc: 0 }
    for (const f of files) map[f.category] += 1
    return map
  }, [files])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = files.filter((f) => {
      if (scope !== 'all' && f.category !== scope) return false
      if (!q) return true
      return `${f.fileName} ${KIND_LABEL[f.kind]} ${f.caption ?? ''}`.toLowerCase().includes(q)
    })
    return sortFiles(filtered, sortKey, sortDir)
  }, [files, scope, query, sortKey, sortDir])

  const media = useMemo(() => visible.filter((f) => f.kind === 'image' || f.kind === 'video'), [visible])
  const selected = visible.find((f) => f.id === selectedId) ?? null

  // акт мог распознаться ещё в форме создания — забираем его итог, когда он придёт
  useEffect(() => {
    if (pendingAct?.repairId !== repairId) return
    const state = takeActResult(repairId)
    if (state) setAkt(state)
  }, [pendingAct, repairId, takeActResult])

  // файл мог исчезнуть после удаления — снимаем мёртвое выделение, не трогая живое
  useEffect(() => {
    const alive = new Set(files.map((f) => f.id))
    setChecked((list) => (list.every((id) => alive.has(id)) ? list : list.filter((id) => alive.has(id))))
    setSelectedId((id) => (id === null || alive.has(id) ? id : null))
  }, [files])

  /** Любое действие над файлом: гасим прошлую ошибку и показываем новую рядом со списком. */
  const run = async (action: () => Promise<void>, done?: string) => {
    setError('')
    setNote('')
    try {
      await action()
      if (done) setNote(done)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось выполнить действие')
    }
  }

  const openViewer = (file: Attachment) => {
    if (file.kind === 'image' || file.kind === 'video') {
      const index = media.findIndex((m) => m.id === file.id)
      if (index >= 0) setLightbox(index)
      return
    }
    setDocView(file)
  }

  const addFiles = async (list: File[]) => {
    setBusy(true)
    setError('')
    setNote('')
    let act: Attachment | null = null
    try {
      for (const file of list) {
        const added = await addAttachment(repairId, file, scope === 'all' ? undefined : scope)
        if (!act && added.category === 'act') act = added
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прикрепить файл')
    } finally {
      setBusy(false)
    }
    // распознавание запускаем после загрузки: оно долгое, а файл уже на месте
    if (act && settings.aktAutoRecognize) await recognizeAct(act)
  }

  /** Распознавание входного акта: заполняет заявку и собирает документы. */
  const recognizeAct = async (file: Attachment) => {
    setError('')
    setAkt({ kind: 'running', stage: 'Готовлюсь', fileName: file.fileName })
    try {
      const result = await runAct(repairId, file, actOptions, (stage) =>
        setAkt({ kind: 'running', stage, fileName: file.fileName }),
      )
      setAkt({ kind: 'done', result })
    } catch (e) {
      setAkt({ kind: 'error', message: e instanceof Error ? e.message : 'Неизвестная ошибка' })
    }
  }

  const moveChecked = (category: AttachmentCategory) =>
    run(async () => {
      const changed = await Promise.all(checked.map((id) => setCategory(id, category)))
      setChecked([])
      const act = changed.find((f) => f.category === 'act')
      if (act && settings.aktAutoRecognize) void recognizeAct(act)
    }, `Перенесено в раздел «${CATEGORY_LABEL[category]}»`)

  const removeChecked = () =>
    run(async () => {
      for (const id of checked) await removeAttachment(id)
      setChecked([])
    })

  const toggleCheck = (id: number) =>
    setChecked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  return (
    <div className="section fm">
      <h3 className="section__title">
        <Icon name="folder" size={13} /> Файлы {files.length > 0 && `(${files.length})`}
      </h3>

      <div className="fm__bar">
        <span className="fm__search">
          <Icon name="search" size={13} />
          <input
            className="input input--sm"
            placeholder="Поиск по имени файла"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="fm__clear" onClick={() => setQuery('')} aria-label="Очистить поиск">
              <Icon name="x" size={12} />
            </button>
          )}
        </span>

        <button
          className="doc__act"
          title={sortDir === 'asc' ? 'По возрастанию' : 'По убыванию'}
          aria-label="Сменить порядок сортировки"
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          data-on={sortDir === 'asc'}
        >
          <Icon name="sort" size={13} />
        </button>
        <select
          className="select select--sm"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          aria-label="Сортировка"
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>

      </div>

      <div className="fm__scopes">
        {SCOPE_ORDER.map((s) => (
          <button key={s} className="chip" data-on={scope === s} onClick={() => setScope(s)}>
            {s === 'all' ? 'Все' : CATEGORY_LABEL[s]} <span className="chip__count">{counts[s]}</span>
          </button>
        ))}
        <span className="fm__scopesEnd" />
        <button
          className="doc__act"
          data-on={view === 'list'}
          onClick={() => setView('list')}
          title="Списком"
          aria-label="Показать списком"
        >
          <Icon name="list" size={13} />
        </button>
        <button
          className="doc__act"
          data-on={view === 'grid'}
          onClick={() => setView('grid')}
          title="Плиткой"
          aria-label="Показать плиткой"
        >
          <Icon name="grid" size={13} />
        </button>
      </div>

      {checked.length > 0 && (
        <div className="fm__bulk">
          <Icon name="check" size={13} />
          <span>Выбрано {checked.length}</span>
          <span style={{ flex: 1 }} />
          {(['act', 'media', 'doc'] as AttachmentCategory[]).map((c) => (
            <button key={c} className="chip chip--sm" onClick={() => void moveChecked(c)}>
              В «{CATEGORY_LABEL[c]}»
            </button>
          ))}
          <button className="doc__act doc__act--danger" onClick={() => void removeChecked()} aria-label="Удалить выбранные">
            <Icon name="trash" size={13} />
          </button>
          <button className="doc__act" onClick={() => setChecked([])} aria-label="Снять выделение">
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      {akt && (
        <ActPanel
          state={akt}
          onClose={() => setAkt(null)}
          onOpenFolder={(folder) => void run(() => openFolder(folder))}
        />
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon="folder"
          title={files.length === 0 ? 'Файлов пока нет' : 'Ничего не найдено'}
          hint={files.length === 0 ? undefined : 'Измените раздел или поисковый запрос'}
        />
      ) : view === 'grid' ? (
        <div className="fm__grid">
          {visible.map((f) => (
            <FileTile
              key={f.id}
              file={f}
              selected={f.id === selectedId}
              checked={checked.includes(f.id)}
              onCheck={() => toggleCheck(f.id)}
              onSelect={() => setSelectedId(f.id === selectedId ? null : f.id)}
              onOpen={() => openViewer(f)}
            />
          ))}
        </div>
      ) : (
        <div className="fm__list">
          {visible.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              selected={f.id === selectedId}
              checked={checked.includes(f.id)}
              onCheck={() => toggleCheck(f.id)}
              onSelect={() => setSelectedId(f.id === selectedId ? null : f.id)}
              onOpen={() => openViewer(f)}
              onAction={run}
            />
          ))}
        </div>
      )}

      {selected && (
        <FilePreview
          file={selected}
          repair={repair}
          onOpen={() => openViewer(selected)}
          onAction={run}
          onRecognize={selected.category === 'act' ? () => void recognizeAct(selected) : undefined}
          onClose={() => setSelectedId(null)}
        />
      )}

      <DropZone
        onFiles={addFiles}
        disabled={busy}
        accept={scope === 'act' ? '.pdf,image/*' : FILE_ACCEPT}
        title={
          busy
            ? 'Загрузка…'
            : scope === 'act'
              ? 'Перетащите скан акта приёма'
              : scope === 'media'
                ? 'Перетащите фото и видео'
                : 'Перетащите файлы'
        }
        hint={
          scope === 'act'
            ? 'PDF или фото — поля заявки заполнятся из скана, когда распознавание будет готово'
            : scope === 'media'
              ? 'с iPhone и Android — HEIC получит JPEG-копию для просмотра'
              : 'Файл попадёт в раздел по своему типу — его всегда можно перенести'
        }
      />

      {note && (
        <p className="hintNote">
          <Icon name="sparkles" size={13} />
          {note}
        </p>
      )}
      {error && (
        <p className="field__error" style={{ marginTop: 8 }}>
          {error}
        </p>
      )}

      {lightbox !== null && media.length > 0 && (
        <Lightbox
          items={media}
          index={Math.min(lightbox, media.length - 1)}
          repair={repair}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}

      {docView && (
        <Modal title={docView.fileName} width={1040} onClose={() => setDocView(null)}>
          <div className="fv__stage">
            <FileView file={docView} repair={repair} />
          </div>
          <p className="actView__link">
            <span className="doc__meta">
              {KIND_LABEL[docView.kind]} · {formatSize(docView.size)}
            </span>
            <span style={{ flex: 1 }} />
            <button className="btn btn--sm" onClick={() => void run(() => openExternally(docView))}>
              <Icon name="external" size={13} />
              Открыть в системе
            </button>
            <button className="btn btn--sm" onClick={() => void run(() => saveCopy(docView))}>
              <Icon name="download" size={13} />
              Сохранить как…
            </button>
          </p>
        </Modal>
      )}
    </div>
  )
}

/** Крупное первое фото или видео заявки — предпросмотр в шапке карточки. */
export function CoverMedia({ repairId }: { repairId: number }) {
  const files = useRepairs((s) => s.files)
  const repair = useRepairs((s) => s.items.find((r) => r.id === repairId) ?? null)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const media = useMemo(() => files.filter((f) => f.kind === 'image' || f.kind === 'video'), [files])
  const cover = media.find((f) => f.kind === 'image') ?? media[0]

  if (!cover) return null

  return (
    <>
      <div className="cover">
        {cover.kind === 'image' ? (
          <>
            <button className="cover__open" onClick={() => setLightbox(media.indexOf(cover))} aria-label="Открыть фото">
              <SafeImage file={cover} />
            </button>
            <MediaStamp repair={repair} at={cover.addedAt} />
          </>
        ) : (
          <VideoPlayer file={cover} repair={repair} stampSize="md" className="cover__player" />
        )}
        <button className="cover__zoom" onClick={() => setLightbox(media.indexOf(cover))}>
          <Icon name="zoomIn" size={14} />
          {media.length > 1 ? `${media.length} файлов` : 'Открыть'}
        </button>
      </div>

      {lightbox !== null && (
        <Lightbox
          items={media}
          index={Math.min(lightbox, media.length - 1)}
          repair={repair}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  )
}

/** Кнопки, одинаковые для строки, плитки и панели просмотра. */
function FileActions({
  file,
  onOpen,
  onAction,
  onRecognize,
}: {
  file: Attachment
  onOpen: () => void
  onAction: (action: () => Promise<void>, done?: string) => Promise<void>
  onRecognize?: () => void
}) {
  const { removeAttachment, setCategory } = useRepairs()
  const [copied, setCopied] = useState('')

  const copy = () =>
    onAction(async () => {
      setCopied(await copyLocation(file))
      window.setTimeout(() => setCopied(''), 1600)
    })

  const nextCategory: AttachmentCategory =
    file.category === 'act' ? (file.kind === 'image' || file.kind === 'video' ? 'media' : 'doc') : 'act'

  return (
    <>
      {onRecognize && (
        <button className="doc__act" onClick={onRecognize} title="Распознать акт заново" aria-label="Распознать акт заново">
          <Icon name="scan" size={13} />
        </button>
      )}
      <button className="doc__act" onClick={onOpen} title="Просмотр" aria-label="Просмотр">
        <Icon name="zoomIn" size={13} />
      </button>
      <button
        className="doc__act"
        onClick={() => void onAction(() => openExternally(file))}
        title="Открыть системной программой"
        aria-label="Открыть системной программой"
      >
        <Icon name="external" size={13} />
      </button>
      {canRevealInFolder(file) && (
        <button
          className="doc__act"
          onClick={() => void onAction(() => revealInFolder(file))}
          title="Показать в папке"
          aria-label="Показать в папке"
        >
          <Icon name="folder" size={13} />
        </button>
      )}
      <button
        className="doc__act"
        onClick={() => void onAction(() => saveCopy(file))}
        title="Сохранить как…"
        aria-label="Сохранить как…"
      >
        <Icon name="download" size={13} />
      </button>
      <button
        className="doc__act"
        onClick={() => void copy()}
        title={copied || (file.path ? 'Скопировать путь' : 'Скопировать ссылку')}
        aria-label="Скопировать расположение"
      >
        <Icon name={copied ? 'check' : 'link'} size={13} />
      </button>
      <button
        className="doc__act"
        onClick={() => void onAction(async () => void (await setCategory(file.id, nextCategory)))}
        title={`Перенести в «${CATEGORY_LABEL[nextCategory]}»`}
        aria-label="Сменить раздел"
      >
        <Icon name={file.category === 'act' ? 'arrowRight' : 'inbox'} size={13} />
      </button>
      <button
        className="doc__act doc__act--danger"
        onClick={() => void onAction(async () => void (await removeAttachment(file.id)))}
        title="Удалить файл"
        aria-label="Удалить файл"
      >
        <Icon name="trash" size={13} />
      </button>
    </>
  )
}

function FileRow({
  file,
  selected,
  checked,
  onCheck,
  onSelect,
  onOpen,
  onAction,
}: {
  file: Attachment
  selected: boolean
  checked: boolean
  onCheck: () => void
  onSelect: () => void
  onOpen: () => void
  onAction: (action: () => Promise<void>, done?: string) => Promise<void>
}) {
  return (
    <div className="doc fm__row" data-on={selected}>
      <input
        className="fm__check"
        type="checkbox"
        checked={checked}
        onChange={onCheck}
        aria-label={`Выбрать ${file.fileName}`}
      />
      <button className="fm__pick" onClick={onSelect} onDoubleClick={onOpen} title="Выделить · двойной клик открывает">
        <span className="doc__icon" style={{ ['--doc-color' as string]: KIND_COLOR[file.kind] }}>
          <Icon name={iconFor(file)} size={15} />
        </span>
        <span className="doc__body">
          <span className="doc__name">{file.fileName}</span>
          <span className="doc__meta">
            {KIND_LABEL[file.kind]} · {formatSize(file.size)} · {formatDate(file.addedAt, 'dd.mm.yyyy')} ·{' '}
            {CATEGORY_LABEL[file.category]}
            {file.preview ? ' · есть JPEG-копия' : ''}
          </span>
        </span>
      </button>
      <button className="doc__act" onClick={onOpen} title="Просмотр" aria-label="Просмотр">
        <Icon name="zoomIn" size={13} />
      </button>
      <button
        className="doc__act"
        onClick={() => void onAction(() => openExternally(file))}
        title="Открыть системной программой"
        aria-label="Открыть системной программой"
      >
        <Icon name="external" size={13} />
      </button>
    </div>
  )
}

function FileTile({
  file,
  selected,
  checked,
  onCheck,
  onSelect,
  onOpen,
}: {
  file: Attachment
  selected: boolean
  checked: boolean
  onCheck: () => void
  onSelect: () => void
  onOpen: () => void
}) {
  return (
    <div className="fm__tile" data-on={selected}>
      <input
        className="fm__check fm__check--tile"
        type="checkbox"
        checked={checked}
        onChange={onCheck}
        aria-label={`Выбрать ${file.fileName}`}
      />
      <button className="fm__tileBody" onClick={onSelect} onDoubleClick={onOpen} title={file.fileName}>
        <span className="fm__thumb">
          {file.kind === 'image' ? (
            <SafeImage file={file} compact />
          ) : (
            <Icon name={iconFor(file)} size={26} />
          )}
        </span>
        <span className="fm__tileName">{file.fileName}</span>
        <span className="fm__tileMeta">
          {KIND_LABEL[file.kind]} · {formatSize(file.size)}
        </span>
      </button>
    </div>
  )
}

/** Просмотр выделенного файла прямо в карточке — без ухода в отдельное окно. */
function FilePreview({
  file,
  repair,
  onOpen,
  onAction,
  onRecognize,
  onClose,
}: {
  file: Attachment
  repair: Repair | null
  onOpen: () => void
  onAction: (action: () => Promise<void>, done?: string) => Promise<void>
  onRecognize?: () => void
  onClose: () => void
}) {
  return (
    <div className="fm__preview">
      <div className="fm__previewHead">
        <span className="doc__icon" style={{ ['--doc-color' as string]: KIND_COLOR[file.kind] }}>
          <Icon name={iconFor(file)} size={14} />
        </span>
        <span className="fm__previewName" title={file.fileName}>
          {file.fileName}
        </span>
        <span style={{ flex: 1 }} />
        <button className="doc__act" onClick={onClose} title="Закрыть просмотр" aria-label="Закрыть просмотр">
          <Icon name="x" size={13} />
        </button>
      </div>

      <div className="fm__previewActs">
        <FileActions file={file} onOpen={onOpen} onAction={onAction} onRecognize={onRecognize} />
      </div>

      <div className="fm__previewBody">
        <FileView file={file} repair={repair} compact />
      </div>

      <div className="fm__previewMeta">
        <span>{formatSize(file.size)}</span>
        <span>·</span>
        <span>добавлен {formatDate(file.addedAt, 'dd.mm.yyyy')}</span>
        <span>·</span>
        <span>{CATEGORY_LABEL[file.category]}</span>
        {file.path && (
          <>
            <span>·</span>
            <span className="fm__path" title={file.path}>
              {file.path}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
