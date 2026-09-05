import { useMemo, useState } from 'react'
import { DropZone, Icon, Lightbox, Modal } from '../ui'
import { useRepairs } from './store'
import { isTauri } from './repo'
import { recognizeFromScan } from '../lib/ocr'
import { MediaStamp } from './MediaStamp'
import { VideoPlayer } from './VideoPlayer'
import { SafeImage } from './SafeImage'
import { KIND_COLOR, KIND_LABEL, formatSize, type Attachment } from './types'
import { formatDate } from '../lib/date'

const storageHint = () => (isTauri() ? 'Папка приложения' : 'Хранилище браузера')
const iconFor = (f: Attachment) => (f.kind === 'video' ? 'video' : f.kind === 'image' ? 'image' : 'file')

/** Строка файла: прямая ссылка на оригинал и всё, что с ним можно сделать. */
function FileRow({
  file,
  onOpen,
  extra,
}: {
  file: Attachment
  onOpen?: () => void
  extra?: React.ReactNode
}) {
  const { removeAttachment, setCategory } = useRepairs()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.src)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* буфер обмена недоступен — ссылка всё равно видна в строке */
    }
  }

  return (
    <div className="doc">
      <span className="doc__icon" style={{ ['--doc-color' as string]: KIND_COLOR[file.kind] }}>
        <Icon name={iconFor(file)} size={15} />
      </span>
      <span className="doc__body">
        <a className="doc__name doc__link" href={file.src} target="_blank" rel="noreferrer" title="Открыть оригинал">
          {file.fileName}
        </a>
        <span className="doc__meta">
          {KIND_LABEL[file.kind]} · {formatSize(file.size)} · {formatDate(file.addedAt, 'dd.mm.yyyy')} · {storageHint()}
          {file.preview ? ' · есть JPEG-копия' : ''}
        </span>
      </span>
      {extra}
      {onOpen && (
        <button className="doc__act" onClick={onOpen} title="Просмотр" aria-label="Просмотр">
          <Icon name="zoomIn" size={13} />
        </button>
      )}
      <button className="doc__act" onClick={copy} title={copied ? 'Ссылка скопирована' : 'Скопировать ссылку'} aria-label="Скопировать ссылку">
        <Icon name={copied ? 'check' : 'link'} size={13} />
      </button>
      <a className="doc__act" href={file.src} download={file.fileName} title="Сохранить файл" aria-label="Сохранить файл">
        <Icon name="download" size={13} />
      </a>
      <button
        className="doc__act"
        onClick={() => setCategory(file.id, file.category === 'act' ? (file.kind === 'image' || file.kind === 'video' ? 'media' : 'doc') : 'act')}
        title={file.category === 'act' ? 'Убрать из входного акта' : 'Сделать входным актом'}
        aria-label="Сменить раздел"
      >
        <Icon name={file.category === 'act' ? 'arrowRight' : 'inbox'} size={13} />
      </button>
      <button className="doc__act" onClick={() => removeAttachment(file.id)} title="Удалить файл" aria-label="Удалить файл">
        <Icon name="trash" size={13} />
      </button>
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

/** Входной акт: обычно сканированный PDF, поэтому у него отдельное место и своё окно просмотра. */
function ActSection({ repairId, files }: { repairId: number; files: Attachment[] }) {
  const { addAttachment, update } = useRepairs()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [viewing, setViewing] = useState<Attachment | null>(null)

  const add = async (list: File[], recognize: boolean) => {
    setBusy(true)
    try {
      for (const file of list) {
        if (recognize) {
          try {
            const draft = await recognizeFromScan(file)
            await update(repairId, draft)
            setNote('Поля заполнены из скана акта')
          } catch (e) {
            setNote(e instanceof Error ? e.message : 'Распознавание пока недоступно')
          }
        }
        await addAttachment(repairId, file, 'act')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="section">
      <h3 className="section__title">
        <Icon name="inbox" size={13} /> Входной акт {files.length > 0 && `(${files.length})`}
      </h3>

      {files.map((f) => (
        <div className="act" key={f.id}>
          <button className="act__preview" onClick={() => setViewing(f)} aria-label={`Открыть ${f.fileName}`}>
            {f.kind === 'image' ? <SafeImage file={f} compact /> : <Icon name="file" size={26} />}
            <span className="act__open">
              <Icon name="maximize" size={13} /> Открыть в окне
            </span>
          </button>
          <FileRow file={f} onOpen={() => setViewing(f)} />
        </div>
      ))}

      <DropZone
        onFiles={(list) => add(list, true)}
        disabled={busy}
        accept=".pdf,image/*"
        title={busy ? 'Загрузка…' : files.length ? 'Добавить ещё лист акта' : 'Перетащите скан акта приёма'}
        hint="PDF или фото — поля заявки заполнятся из скана, когда распознавание будет готово"
      />

      {note && (
        <p className="hintNote">
          <Icon name="sparkles" size={13} />
          {note}
        </p>
      )}

      {viewing && (
        <Modal title={viewing.fileName} width={1000} onClose={() => setViewing(null)}>
          <div className="actView">
            {viewing.kind === 'image' ? (
              <SafeImage file={viewing} />
            ) : (
              <iframe src={viewing.src} title={viewing.fileName} />
            )}
          </div>
          <p className="actView__link">
            <Icon name="link" size={13} />
            <a href={viewing.src} target="_blank" rel="noreferrer">
              Прямая ссылка на файл
            </a>
            <a href={viewing.src} download={viewing.fileName}>
              Сохранить
            </a>
          </p>
        </Modal>
      )}
    </div>
  )
}

/** Вложения заявки, разложенные по разделам: акт, фото и видео, документы. */
export function Attachments({ repairId }: { repairId: number }) {
  const { files, addAttachment } = useRepairs()
  const repair = useRepairs((s) => s.items.find((r) => r.id === repairId) ?? null)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const act = useMemo(() => files.filter((f) => f.category === 'act'), [files])
  const media = useMemo(() => files.filter((f) => f.category === 'media'), [files])
  const docs = useMemo(() => files.filter((f) => f.category === 'doc'), [files])
  const images = useMemo(() => media.filter((f) => f.kind === 'image'), [media])
  const videos = useMemo(() => media.filter((f) => f.kind === 'video'), [media])

  const openLightbox = (file: Attachment) => setLightbox(Math.max(0, media.findIndex((m) => m.id === file.id)))

  const onFiles = async (list: File[]) => {
    setBusy(true)
    setError('')
    try {
      for (const file of list) await addAttachment(repairId, file)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прикрепить файл')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ActSection repairId={repairId} files={act} />

      <div className="section">
        <h3 className="section__title">
          <Icon name="image" size={13} /> Фото и видео {media.length > 0 && `(${media.length})`}
        </h3>

        {images.length > 0 && (
          <div className="photos">
            {images.map((p) => (
              <div className="photo" key={p.id}>
                <button className="photo__open" onClick={() => openLightbox(p)} aria-label={`Открыть ${p.fileName}`}>
                  <SafeImage file={p} compact />
                </button>
              </div>
            ))}
          </div>
        )}

        {videos.map((v) => (
          <div className="player" key={v.id}>
            <VideoPlayer file={v} repair={repair} />
          </div>
        ))}

        {media.length > 0 && (
          <div className="docs">
            {media.map((f) => (
              <FileRow key={f.id} file={f} onOpen={() => openLightbox(f)} />
            ))}
          </div>
        )}

        <DropZone
          onFiles={onFiles}
          disabled={busy}
          accept="image/*,video/*,.heic,.heif,.mov,.mkv,.avi,.mts,.m2ts,.3gp"
          title={busy ? 'Загрузка…' : 'Перетащите фото и видео'}
          hint="с iPhone и Android — HEIC получит JPEG-копию для просмотра"
        />
      </div>

      <div className="section">
        <h3 className="section__title">
          <Icon name="paperclip" size={13} /> Документы {docs.length > 0 && `(${docs.length})`}
        </h3>

        {docs.length > 0 && (
          <div className="docs">
            {docs.map((f) => (
              <FileRow key={f.id} file={f} />
            ))}
          </div>
        )}

        <DropZone
          onFiles={onFiles}
          disabled={busy}
          title={busy ? 'Загрузка…' : 'Перетащите документы'}
          hint="PDF, Word, Excel, архивы — и любые другие файлы"
        />

        {error && (
          <p className="field__error" style={{ marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>

      {lightbox !== null && media.length > 0 && (
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
