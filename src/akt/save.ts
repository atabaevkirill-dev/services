import { fillTemplate } from './docx'
import type { ActFields } from './types'

/**
 * Сборка результата: на каждое устройство — свой документ Word, рядом страницы
 * исходного акта. Имена файлов и папки — требование заказчика, менять их
 * можно только по его просьбе:
 *   папка   30.03.2026_Акт №45
 *   документ 30_03_26_Ремонт 19050G0700131.docx
 */

export interface ActFile {
  name: string
  data: Uint8Array
}

/** Символы, запрещённые в именах файлов Windows. */
function safePart(s: string): string {
  return (s || '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** «30.03.2026» → «30_03_26» */
export function datePrefix(actDate: string): string {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((actDate || '').trim())
  if (!m) return ''
  return `${m[1].padStart(2, '0')}_${m[2].padStart(2, '0')}_${m[3].slice(2)}`
}

export function docFileName(f: ActFields, idx: number): string {
  const prefix = datePrefix(f.actDate) || 'акт'
  const what = safePart(f.serialNumber) || safePart(f.productName).slice(0, 40) || `устройство ${idx + 1}`
  return `${prefix}_Ремонт ${what}.docx`
}

export function actFolderName(actDate: string, actNumber: string): string {
  return safePart(`${(actDate || '').trim()}_Акт №${(actNumber || '').trim()}`)
}

/** Исходный акт постранично: «Страница 1.pdf», «Страница 2.pdf»… */
export async function splitPdfPages(bytes: Uint8Array): Promise<{ files: ActFile[]; warning: string }> {
  try {
    const { PDFDocument } = await import('pdf-lib')
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const count = src.getPageCount()
    if (count === 0) throw new Error('в файле нет страниц')

    const files: ActFile[] = []
    for (let i = 0; i < count; i += 1) {
      const out = await PDFDocument.create()
      const [page] = await out.copyPages(src, [i])
      out.addPage(page)
      files.push({ name: `Страница ${i + 1}.pdf`, data: await out.save() })
    }
    return { files, warning: '' }
  } catch {
    return {
      files: [{ name: 'Акт (все страницы).pdf', data: bytes }],
      warning: 'PDF не удалось разделить на страницы — вложен целиком одним файлом.',
    }
  }
}

/** Документы Word по одному на устройство, с разведением одинаковых имён. */
export async function buildDocuments(documents: ActFields[]): Promise<ActFile[]> {
  const files: ActFile[] = []
  for (let i = 0; i < documents.length; i += 1) {
    files.push({ name: docFileName(documents[i], i), data: await fillTemplate(documents[i]) })
  }

  const seen = new Map<string, number>()
  for (const f of files) {
    const n = (seen.get(f.name) ?? 0) + 1
    seen.set(f.name, n)
    if (n > 1) f.name = f.name.replace(/\.docx$/i, ` (${n}).docx`)
  }
  return files
}

export interface SaveResult {
  folder: string
  saved: string[]
}

/** Записать папку акта на диск. Путь пользователь выбирает в настройках. */
export async function saveActFolder(basePath: string, folderName: string, files: ActFile[]): Promise<SaveResult> {
  const [fs, path] = await Promise.all([import('@tauri-apps/plugin-fs'), import('@tauri-apps/api/path')])
  const folder = await path.join(basePath, folderName)
  await fs.mkdir(folder, { recursive: true })

  const saved: string[] = []
  for (const f of files) {
    await fs.writeFile(await path.join(folder, f.name), f.data)
    saved.push(f.name)
  }
  return { folder, saved }
}
