import type { Attachment } from '../repairs/types'

/**
 * Чем показывать файл внутри приложения.
 *
 * Движок WebView сам умеет только картинки, видео и PDF. Остальное мы разбираем
 * сами: таблицы — SheetJS, Word — mammoth, ODT и архивы — распаковкой, текст —
 * с подбором кодировки. Наружу файл отдаётся только тогда, когда показать нечем.
 */
export type PreviewKind = 'image' | 'video' | 'pdf' | 'sheet' | 'rich' | 'text' | 'archive' | 'none'

const SHEET_EXT = ['xlsx', 'xlsm', 'xlsb', 'xls', 'ods', 'csv', 'tsv', 'dif']
const RICH_EXT = ['docx', 'odt', 'rtf']
const TEXT_EXT = ['txt', 'md', 'markdown', 'log', 'json', 'xml', 'yml', 'yaml', 'ini', 'cfg', 'srt', 'sql', 'htm', 'html']
const ARCHIVE_EXT = ['zip', 'jar']

export const extOf = (fileName: string): string => fileName.split('.').pop()?.toLowerCase() ?? ''

export function previewKindOf(file: Attachment): PreviewKind {
  if (file.kind === 'image') return 'image'
  if (file.kind === 'video') return 'video'
  if (file.kind === 'pdf') return 'pdf'

  const ext = extOf(file.fileName)
  if (SHEET_EXT.includes(ext)) return 'sheet'
  if (RICH_EXT.includes(ext)) return 'rich'
  if (TEXT_EXT.includes(ext)) return 'text'
  if (ARCHIVE_EXT.includes(ext)) return 'archive'
  return 'none'
}

/** Почему файл нельзя показать внутри — текст для пользователя. */
export function whyNotViewable(file: Attachment): string {
  const ext = extOf(file.fileName)
  if (ext === 'doc') return 'Старый формат Word (.doc) внутри не открывается — нужен Word или конвертация в .docx'
  if (ext === 'rar' || ext === '7z') return 'Содержимое .rar и .7z показать нельзя — распакуйте архив системным приложением'
  return 'Для этого формата нет встроенного просмотра'
}

/** Содержимое файла: одинаково работает и с asset-ссылкой в десктопе, и с blob-ссылкой в браузере. */
export async function loadBytes(file: Attachment): Promise<ArrayBuffer> {
  const response = await fetch(file.src)
  if (!response.ok) throw new ReadableError('Не удалось прочитать файл из хранилища')
  return response.arrayBuffer()
}

/** Текст с подбором кодировки: файлы из старых программ часто в windows-1251. */
export function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1251').decode(bytes)
  }
}

export interface SheetData {
  name: string
  rows: string[][]
  /** Строк в листе больше, чем показано. */
  truncated: boolean
}

const MAX_ROWS = 500
const MAX_COLS = 40

/** Форматы таблиц, которые внутри — обычный текст: им нужна разгадка кодировки. */
const TEXT_SHEET_EXT = ['csv', 'tsv', 'txt', 'dif']

/**
 * Таблица: листы, ячейки уже приведены к строкам — показываем их React-ом, без вставки HTML.
 *
 * CSV из 1С и старых программ приходит в windows-1251, а SheetJS для двоичного
 * чтения считает байты по кодовой странице 1252 и ломает кириллицу. Поэтому
 * текстовые таблицы сначала раскодируем сами и отдаём строкой.
 */
export async function readSheets(buffer: ArrayBuffer, fileName: string): Promise<SheetData[]> {
  const XLSX = await import('xlsx')
  const book = await orFail(
    () =>
      TEXT_SHEET_EXT.includes(extOf(fileName))
        ? XLSX.read(decodeText(buffer), { type: 'string', raw: false })
        : XLSX.read(buffer, { type: 'array', cellDates: true }),
    'Файл не открылся как таблица — он повреждён или это другой формат',
  )
  return book.SheetNames.map((name) => {
    const sheet = book.Sheets[name]
    const all = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '', raw: false })
    const rows = all.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLS).map((cell) => String(cell ?? '')))
    return { name, rows, truncated: all.length > MAX_ROWS }
  })
}

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SUP', 'SUB', 'SPAN', 'DIV',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'IMG', 'A', 'HR',
])
const ALLOWED_ATTRS = new Set(['src', 'alt', 'href', 'colspan', 'rowspan'])

/**
 * Оставляет из разметки только безопасный набор тегов.
 * Документ приносит пользователь, поэтому скрипты, обработчики событий
 * и ссылки вида `javascript:` в карточку попасть не должны.
 */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const walk = (node: Element) => {
    for (const child of [...node.children]) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(...child.childNodes)
        continue
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase()
        const value = attr.value.trim().toLowerCase()
        const unsafeLink = (name === 'href' || name === 'src') && !/^(https?:|data:image\/|mailto:|#|\/)/.test(value)
        if (!ALLOWED_ATTRS.has(name) || unsafeLink) child.removeAttribute(attr.name)
      }
      walk(child)
    }
  }

  walk(doc.body)
  return doc.body.innerHTML
}

/**
 * Разборщики приносят свои английские сообщения со ссылками на документацию.
 * Показывать их пользователю нельзя, поэтому подменяем на понятную причину.
 */
async function orFail<T>(work: () => Promise<T> | T, reason: string): Promise<T> {
  try {
    return await work()
  } catch (e) {
    if (e instanceof ReadableError) throw e
    throw new Error(reason)
  }
}

/** Ошибка с текстом, который уже годится для показа. */
class ReadableError extends Error {}

/** Word (.docx) — размеченный текст с картинками, встроенными как data-ссылки. */
export async function readDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await orFail(
    () => mammoth.convertToHtml({ arrayBuffer: buffer }),
    'Файл не открылся как документ Word — он повреждён или сохранён в старом формате .doc',
  )
  const html = sanitizeHtml(result.value)
  if (!html.trim()) throw new ReadableError('В документе нет текста, который можно показать')
  return html
}

/** OpenDocument (.odt) — вытаскиваем абзацы из content.xml внутри архива. */
export async function readOdt(buffer: ArrayBuffer): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate')
  const files = await orFail(
    () => unzipSync(new Uint8Array(buffer)),
    'Файл не открылся как документ OpenDocument — он повреждён',
  )
  const content = files['content.xml']
  if (!content) throw new ReadableError('Внутри файла нет содержимого документа')
  const xml = new DOMParser().parseFromString(strFromU8(content), 'application/xml')
  const paragraphs = [...xml.getElementsByTagName('text:p')].map((p) => p.textContent ?? '')
  return paragraphs.map((line) => `<p>${escapeHtml(line)}</p>`).join('')
}

/** RTF — убираем управляющие последовательности, остаётся сам текст. */
export function readRtf(buffer: ArrayBuffer): string {
  const raw = decodeText(buffer)
  const text = raw
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\{\\\*[^{}]*\}/g, '')
    .replace(/\\[a-z]+-?\d*\s?/gi, '')
    .replace(/[{}]/g, '')
    .trim()
  if (!text) throw new ReadableError('В файле не нашлось текста')
  return text
    .split(/\n{1,}/)
    .filter((line) => line.trim())
    .map((line) => `<p>${escapeHtml(line.trim())}</p>`)
    .join('')
}

export interface ArchiveEntry {
  name: string
  size: number
}

/**
 * Имя файла внутри архива.
 *
 * Флаг «имена в UTF-8» ставят не все архиваторы: Проводник Windows пишет русские
 * имена в cp866. Такое имя приходит побайтно, поэтому собираем байты обратно
 * и разгадываем кодировку — иначе в списке будут «Ð°ÐºÑ».
 */
function decodeEntryName(name: string): string {
  const hasRawBytes = [...name].some((c) => c.charCodeAt(0) >= 0x80 && c.charCodeAt(0) <= 0xff)
  if (!hasRawBytes) return name
  const bytes = Uint8Array.from([...name].map((c) => c.charCodeAt(0) & 0xff))
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('ibm866').decode(bytes)
  }
}

/** Содержимое архива — списком, без распаковки на диск. */
export async function readArchive(buffer: ArrayBuffer): Promise<ArchiveEntry[]> {
  const { unzipSync } = await import('fflate')
  const files = await orFail(
    () => unzipSync(new Uint8Array(buffer)),
    'Архив не читается — он повреждён или защищён паролем',
  )
  return Object.entries(files)
    .filter(([name]) => !name.endsWith('/'))
    .map(([name, data]) => ({ name: decodeEntryName(name), size: data.length }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}
