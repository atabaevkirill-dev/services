export const STATUSES = [
  'accepted',
  'diagnostics',
  'waiting_parts',
  'in_progress',
  'done',
  'issued',
  'rejected',
] as const

export type RepairStatus = (typeof STATUSES)[number]

export const STATUS_META: Record<RepairStatus, { label: string; short: string; color: string; active: boolean }> = {
  accepted: { label: 'Принято', short: 'Принято', color: 'var(--st-accepted)', active: true },
  diagnostics: { label: 'Диагностика', short: 'Диагн.', color: 'var(--st-diagnostics)', active: true },
  waiting_parts: { label: 'Ждём запчасти', short: 'Ждём з/ч', color: 'var(--st-waiting)', active: true },
  in_progress: { label: 'В работе', short: 'В работе', color: 'var(--st-progress)', active: true },
  done: { label: 'Готово', short: 'Готово', color: 'var(--st-done)', active: false },
  issued: { label: 'Выдано', short: 'Выдано', color: 'var(--st-issued)', active: false },
  rejected: { label: 'Отказ', short: 'Отказ', color: 'var(--st-rejected)', active: false },
}

export type AttachmentKind = 'image' | 'video' | 'pdf' | 'word' | 'excel' | 'archive' | 'other'

/** Раздел карточки, в котором лежит файл. */
export type AttachmentCategory = 'act' | 'media' | 'doc'

export const CATEGORY_LABEL: Record<AttachmentCategory, string> = {
  act: 'Входной акт',
  media: 'Фото и видео',
  doc: 'Документы',
}

export interface Attachment {
  id: number
  repairId: number
  fileName: string
  mime: string
  kind: AttachmentKind
  category: AttachmentCategory
  size: number
  /** Ссылка на оригинал файла */
  src: string
  /** Просматриваемая копия, если оригинал движок не открывает (HEIC → JPEG) */
  preview: string
  /**
   * Путь к файлу на диске — только в настольной сборке. Нужен, чтобы открыть файл
   * системной программой и показать его в проводнике: asset-ссылка для этого не годится.
   * В браузере файла на диске нет, поэтому `null`.
   */
  path: string | null
  caption: string | null
  addedAt: string
}

export function defaultCategory(kind: AttachmentKind): AttachmentCategory {
  if (kind === 'image' || kind === 'video') return 'media'
  return 'doc'
}

const EXT_KIND: Record<string, AttachmentKind> = {
  pdf: 'pdf',
  doc: 'word', docx: 'word', rtf: 'word', odt: 'word',
  xls: 'excel', xlsx: 'excel', csv: 'excel', ods: 'excel',
  zip: 'archive', rar: 'archive', '7z': 'archive',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', heic: 'image', heif: 'image', bmp: 'image', tif: 'image', tiff: 'image', avif: 'image', svg: 'image',
  mp4: 'video', mov: 'video', m4v: 'video', webm: 'video', mkv: 'video', avi: 'video', wmv: 'video', flv: 'video',
  mpg: 'video', mpeg: 'video', mts: 'video', m2ts: 'video', ts: 'video', ogv: 'video', '3gp': 'video', '3g2': 'video',
  mxf: 'video', vob: 'video', rm: 'video', rmvb: 'video', divx: 'video', asf: 'video', f4v: 'video', insv: 'video',
}

const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg',
  mkv: 'video/x-matroska', avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', flv: 'video/x-flv',
  mpg: 'video/mpeg', mpeg: 'video/mpeg', mts: 'video/mp2t', m2ts: 'video/mp2t', ts: 'video/mp2t',
  '3gp': 'video/3gpp', '3g2': 'video/3gpp2', mxf: 'application/mxf', vob: 'video/dvd', asf: 'video/x-ms-asf',
  f4v: 'video/x-f4v', insv: 'video/mp4', divx: 'video/x-msvideo', rm: 'application/vnd.rn-realmedia',
}

/**
 * MIME для тега <video>: телефоны часто отдают файл без типа, тогда берём его по расширению.
 * Пустая строка — пусть движок определяет сам по содержимому.
 */
export function videoMime(fileName: string, mime = ''): string {
  if (mime.startsWith('video/')) return mime
  return VIDEO_MIME[fileName.split('.').pop()?.toLowerCase() ?? ''] ?? ''
}

/** Понятная причина, почему движок отказался играть файл. */
export function mediaErrorText(code: number | undefined): string {
  if (code === 3) return 'Файл повреждён или обрывается при декодировании'
  if (code === 2) return 'Не удалось прочитать файл из хранилища'
  if (code === 1) return 'Воспроизведение прервано'
  return 'Движок просмотра не поддерживает кодек или контейнер этого файла'
}

export function kindOf(fileName: string, mime = ''): AttachmentKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return EXT_KIND[ext] ?? 'other'
}

export const KIND_LABEL: Record<AttachmentKind, string> = {
  image: 'Фото',
  video: 'Видео',
  pdf: 'PDF',
  word: 'Документ',
  excel: 'Таблица',
  archive: 'Архив',
  other: 'Файл',
}

export const KIND_COLOR: Record<AttachmentKind, string> = {
  image: 'var(--st-diagnostics)',
  video: 'var(--st-progress)',
  pdf: 'var(--st-rejected)',
  word: 'var(--st-diagnostics)',
  excel: 'var(--st-done)',
  archive: 'var(--st-waiting)',
  other: 'var(--st-accepted)',
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export interface StatusEvent {
  id: number
  repairId: number
  fromStatus: RepairStatus | null
  toStatus: RepairStatus
  comment: string | null
  at: string
}

export interface Repair {
  id: number
  number: string
  receivedAt: string
  equipment: string
  serialNo: string | null
  fromWhom: string | null
  contact: string | null
  location: string | null
  problem: string | null
  status: RepairStatus
  notes: string | null
  issuedAt: string | null
  createdAt: string
  updatedAt: string
}

/** `number` пустой строкой означает автонумерацию при создании. */
export type RepairDraft = Omit<Repair, 'id' | 'createdAt' | 'updatedAt'>

export function emptyDraft(): RepairDraft {
  return {
    number: '',
    receivedAt: new Date().toISOString(),
    equipment: '',
    serialNo: '',
    fromWhom: '',
    contact: '',
    location: '',
    problem: '',
    status: 'accepted',
    notes: '',
    issuedAt: null,
  }
}
