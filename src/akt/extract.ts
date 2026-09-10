import { visionChat, providerLabel } from './vision'
import type { ActExtract, DeviceExtract, VisionSettings } from './types'

/**
 * Распознавание дефектного акта.
 *
 * Скан режется на страницы, каждая уходит в модель ОТДЕЛЬНЫМ запросом со своим
 * промптом: так модель не путает позиции разных страниц и возвращает короткий
 * JSON, который она в состоянии удержать. Устройства со всех страниц потом
 * сводятся в один список.
 *
 * Всё считается во фронтенде: PDF растеризует pdfjs прямо в canvas, внешние
 * программы (poppler, ghostscript) не нужны.
 */

/** Больше шести страниц в акте не встречается, а каждая — отдельный запрос к модели. */
const MAX_PAGES = 6

/** 150 dpi: мелкий рукописный текст ещё читается, картинка ещё не огромная. */
const RENDER_SCALE = 150 / 72

const pagePrompt = (pageNo: number, total: number) => `Тебе дана страница ${pageNo} из ${total} скана дефектного акта. Извлеки данные ИМЕННО С ЭТОЙ СТРАНИЦЫ и верни СТРОГО валидный JSON без markdown-обёрток и пояснений, точно по схеме:
{
  "actNumber": "номер акта из шапки, если он виден на этой странице (может быть рукописным) — только сам номер, без '№' и без буквенного суффикса (из '41Д' взять '41'); иначе пустая строка",
  "actDate": "дата составления ДД.ММ.ГГГГ, если видна на этой странице; иначе пустая строка",
  "devices": [
    {
      "productName": "наименование ОДНОЙ позиции оборудования, видимой на этой странице",
      "serialNumber": "её заводской/серийный номер — слитно, без переносов строк и пробелов внутри",
      "declaredDefects": "заявленная неисправность (со слов владельца) для этой позиции, без пометок о срочности",
      "detectedDefects": "текст колонки «Обнаруженные дефекты» для этой позиции, БЕЗ хвоста '— зав. № ...'"
    }
  ]
}
ПРАВИЛА:
1. В devices — только позиции (наименование + серийный номер), которые ЕСТЬ НА ЭТОЙ СТРАНИЦЕ.
2. Каждая позиция таблицы = ОТДЕЛЬНЫЙ элемент массива. Если указано «N шт.» и перечислено N серийных номеров — создай N элементов с одинаковым productName (без «N шт.») и своим serialNumber у каждого.
3. Если дефекты написаны общим текстом для всех позиций страницы — продублируй его в каждом элементе.
4. Если это страница-продолжение (подписи, примечания, текст без наименований и серийных номеров) — верни devices: [].
5. Не выдумывай данные: не найдено на странице — пустая строка "". Номера переписывай посимвольно точно как в документе.`

function extractJson(raw: string): Record<string, unknown> | null {
  const s = raw.trim().replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Серийный номер: убираем разрывы внутри токена — след переносов в скане. */
function cleanSerial(s: string): string {
  const t = (s || '').trim()
  if (!t) return ''
  if (/[A-Za-z]/.test(t) && /\d/.test(t)) return t.replace(/\s+/g, '')
  return t.replace(/\s{2,}/g, ' ')
}

/** Наименование: срезаем хвост количества — каждый прибор идёт отдельной позицией. */
function cleanName(s: string): string {
  return (s || '')
    .replace(/[,;]?\s*\(?\d+\s*шт\.?\)?\s*$/i, '')
    .replace(/^[,;\s]+|[,;\s]+$/g, '')
    .trim()
}

function pickDevices(raw: unknown, pageNo: number): DeviceExtract[] {
  const out: DeviceExtract[] = []
  for (const item of Array.isArray(raw) ? raw : []) {
    const o = (item ?? {}) as Record<string, unknown>
    const d: DeviceExtract = {
      productName: cleanName(String(o.productName ?? '')),
      serialNumber: cleanSerial(String(o.serialNumber ?? '')),
      declaredDefects: String(o.declaredDefects ?? '').trim(),
      detectedDefects: String(o.detectedDefects ?? '').trim(),
      page: pageNo,
    }
    if (!d.productName && !d.serialNumber) continue
    // заявленную не разобрали, а обнаруженная есть — дублируем текст
    if (!d.declaredDefects && d.detectedDefects) d.declaredDefects = d.detectedDefects
    out.push(d)
  }
  return out
}

/** Страницы скана как data-URL. PDF растеризуется, картинка берётся как есть. */
export async function renderPages(file: File | Blob, fileName: string): Promise<string[]> {
  const isPdf = /\.pdf$/i.test(fileName) || file.type === 'application/pdf'
  if (!isPdf) return [await blobToDataUrl(file)]

  const pdfjs = await import('pdfjs-dist')
  // воркер собирается Vite как отдельный файл и работает и в дев-режиме, и в сборке
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  // Сканы актов — картинки JBIG2 и JPEG2000, их pdfjs декодирует загружаемым
  // WASM. Без wasmUrl отрисовка страницы просто зависает, ничего не сообщая.
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
    standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
  })
  const doc = await task.promise
  try {
    const pages: string[] = []
    const count = Math.min(doc.numPages, MAX_PAGES)
    for (let i = 1; i <= count; i += 1) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale: RENDER_SCALE })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Не удалось подготовить холст для страницы PDF')
      // intent: 'print' — не ради печати: в этом режиме pdfjs рисует без кадров
      // анимации. Иначе свёрнутое или скрытое окно останавливает отрисовку
      // насовсем, причём молча.
      await page.render({ canvas, canvasContext: context, viewport, intent: 'print' }).promise
      pages.push(canvas.toDataURL('image/png'))
      page.cleanup()
    }
    return pages
  } finally {
    await task.destroy()
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Не удалось прочитать файл акта'))
    reader.readAsDataURL(blob)
  })
}

export interface ExtractProgress {
  (done: number, total: number): void
}

/** Распознать акт целиком: страницы по очереди, затем сведение позиций. */
export async function extractAct(
  file: File | Blob,
  fileName: string,
  settings: VisionSettings,
  onProgress?: ExtractProgress,
): Promise<ActExtract> {
  const images = await renderPages(file, fileName)
  if (images.length === 0) throw new Error('Из файла не удалось получить ни одной страницы')

  interface PageResult {
    page: number
    actNumber: string
    actDate: string
    devices: DeviceExtract[]
    parseError: boolean
  }

  const runPage = async (url: string, idx: number): Promise<PageResult> => {
    const ask = () => visionChat(settings, pagePrompt(idx + 1, images.length), url)
    let parsed = extractJson(await ask())
    // локальные модели иногда сбиваются с JSON — одна повторная попытка
    if (!parsed) parsed = extractJson(await ask())
    if (!parsed) return { page: idx + 1, actNumber: '', actDate: '', devices: [], parseError: true }
    return {
      page: idx + 1,
      actNumber: String(parsed.actNumber ?? '').trim(),
      actDate: String(parsed.actDate ?? '').trim(),
      devices: pickDevices(parsed.devices, idx + 1),
      parseError: false,
    }
  }

  // строго по очереди: локальная модель занимает одну видеокарту
  const perPage: PageResult[] = []
  for (let idx = 0; idx < images.length; idx += 1) {
    perPage.push(await runPage(images[idx], idx))
    onProgress?.(idx + 1, images.length)
  }

  // сводим позиции: одинаковые имя+номер с разных страниц — одна позиция,
  // различающиеся описания дефектов склеиваем
  const devices: DeviceExtract[] = []
  for (const pg of perPage) {
    for (const d of pg.devices) {
      const prev = devices.find((p) => p.productName === d.productName && p.serialNumber === d.serialNumber)
      if (!prev) {
        devices.push(d)
        continue
      }
      for (const key of ['declaredDefects', 'detectedDefects'] as const) {
        if (!prev[key]) prev[key] = d[key]
        else if (d[key] && prev[key] !== d[key] && !prev[key].includes(d[key])) prev[key] += '; ' + d[key]
      }
    }
  }

  return {
    actNumber: perPage.find((p) => p.actNumber)?.actNumber ?? '',
    actDate: perPage.find((p) => p.actDate)?.actDate ?? '',
    devices,
    totalPages: images.length,
    failedPages: perPage.filter((p) => p.parseError).map((p) => p.page),
    ai: providerLabel(settings),
  }
}
