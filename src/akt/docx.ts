import { unzipSync, zipSync } from 'fflate'
import templateUrl from './template.docx?url'
import type { ActFields } from './types'

/**
 * Заполнение шаблона акта диагностических работ.
 *
 * В шаблоне нет тегов-заполнителей: значение пишется в СОСЕДНЮЮ ячейку таблицы
 * той же строки, а метка ищется по тексту («Наименование изделия» и т.д.).
 * Форматирование клонируется из ячейки «ООО «НПО АМБ»» — иначе вставленный
 * текст выпадает из оформления бланка.
 *
 * Метки должны посимвольно совпадать с текстом в template.docx. Опечатка
 * «Выполненые работы» — из шаблона заказчика, исправлять её здесь нельзя
 * без замены самого шаблона.
 */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

const MONTHS = [
  'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
  'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
]

export function parseDate(s: string): { day: string; month: string; year: string } | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((s || '').trim())
  if (!m) return null
  return {
    day: String(parseInt(m[1], 10)),
    month: MONTHS[parseInt(m[2], 10) - 1] ?? '',
    year: m[3],
  }
}

let templateBytes: Uint8Array | null = null

/** Шаблон лежит рядом со сборкой и читается один раз за сеанс. */
async function loadTemplate(): Promise<Uint8Array> {
  if (templateBytes) return templateBytes
  const res = await fetch(templateUrl)
  if (!res.ok) throw new Error('Шаблон акта не найден в сборке приложения')
  templateBytes = new Uint8Array(await res.arrayBuffer())
  return templateBytes
}

const tags = (node: Element | Document, tag: string): Element[] => Array.from(node.getElementsByTagName(tag))

/** Весь видимый текст узла — склейка его w:t. */
function textOf(el: Element): string {
  return tags(el, 'w:t').map((t) => t.textContent ?? '').join('')
}

/** Прямые дочерние ячейки строки таблицы. */
function cellsOf(row: Element): Element[] {
  return Array.from(row.childNodes).filter(
    (c): c is Element => c.nodeType === 1 && (c as Element).tagName === 'w:tc',
  )
}

function setText(doc: Document, t: Element, value: string) {
  while (t.firstChild) t.removeChild(t.firstChild)
  t.appendChild(doc.createTextNode(value))
  if (value !== value.trim() || / {2,}/.test(value)) t.setAttribute('xml:space', 'preserve')
}

function firstParagraph(cell: Element): Element | null {
  for (const c of Array.from(cell.childNodes)) {
    if (c.nodeType === 1 && (c as Element).tagName === 'w:p') return c as Element
  }
  return null
}

/** Значение в ячейку: текст уходит в первый run, остальные вычищаются. */
function writeCell(doc: Document, cell: Element, value: string, refRunPr: Element | null) {
  const p = firstParagraph(cell)
  if (!p) return
  const runs = tags(p, 'w:r')

  if (runs.length === 0) {
    const r = doc.createElementNS(W_NS, 'w:r')
    if (refRunPr) r.appendChild(refRunPr.cloneNode(true))
    const t = doc.createElementNS(W_NS, 'w:t')
    setText(doc, t, value)
    r.appendChild(t)
    p.appendChild(r)
    return
  }

  const first = runs[0]
  let t = tags(first, 'w:t')[0] as Element | undefined
  if (!t) {
    t = doc.createElementNS(W_NS, 'w:t')
    first.appendChild(t)
  }
  setText(doc, t, value)
  // лишние w:t первого run убираем, у остальных runs чистим текст
  for (const extra of tags(first, 'w:t').slice(1)) extra.parentNode?.removeChild(extra)
  for (const r of runs.slice(1)) for (const tt of tags(r, 'w:t')) setText(doc, tt, '')
}

/** Новый параграф сразу после параграфа с меткой — внутри той же ячейки. */
function paragraphAfter(doc: Document, labelPar: Element, value: string, refRunPr: Element | null) {
  const p = doc.createElementNS(W_NS, 'w:p')
  const r = doc.createElementNS(W_NS, 'w:r')
  if (refRunPr) r.appendChild(refRunPr.cloneNode(true))
  const t = doc.createElementNS(W_NS, 'w:t')
  setText(doc, t, value)
  r.appendChild(t)
  p.appendChild(r)
  labelPar.parentNode?.insertBefore(p, labelPar.nextSibling)
}

/** Заполненный документ Word для одного устройства. */
export async function fillTemplate(f: ActFields): Promise<Uint8Array> {
  const files = unzipSync(await loadTemplate())
  const documentXml = files['word/document.xml']
  if (!documentXml) throw new Error('Шаблон повреждён: внутри нет word/document.xml')

  const doc = new DOMParser().parseFromString(new TextDecoder().decode(documentXml), 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) throw new Error('Шаблон повреждён: не разбирается разметка')
  const body = doc.documentElement

  // эталон оформления значений
  let refRunPr: Element | null = null
  for (const cell of tags(body, 'w:tc')) {
    if (!textOf(cell).includes('ООО «НПО АМБ»')) continue
    const run = tags(cell, 'w:r')[0]
    if (run) refRunPr = tags(run, 'w:rPr')[0] ?? null
    break
  }

  const cellAfter = (label: string): Element | null => {
    for (const row of tags(body, 'w:tr')) {
      const cells = cellsOf(row)
      for (let i = 0; i < cells.length; i += 1) {
        if (textOf(cells[i]).trim().startsWith(label)) return cells[i + 1] ?? null
      }
    }
    return null
  }

  const setValue = (label: string, value: string) => {
    if (!value) return
    const cell = cellAfter(label)
    if (cell) writeCell(doc, cell, value, refRunPr)
  }

  // 1. номер акта
  const num = (f.actNumber || '').replace(/^№\s*/, '').trim()
  if (num) {
    const cell = cellAfter('Акт диагностических работ №')
    if (cell) writeCell(doc, cell, num, refRunPr)
  }

  // 2. дата в шапке: «__» месяц 20__ года
  const d = parseDate(f.actDate)
  if (d) writeHeaderDate(doc, body, d, refRunPr)

  // 3. поля «метка → соседняя ячейка»
  setValue('Наименование изделия', f.productName)
  setValue('Заводской номер', f.serialNumber)
  setValue('Заявленные владельцем', f.declaredDefects)
  setValue('Выявленные неисправности', f.detectedDefects)
  setValue('Дата проведения диагностики', f.diagDate || f.actDate)

  // 4. развёрнутые разделы — новым параграфом внутри ячейки с меткой
  const insertInsideCell = (label: string, value: string) => {
    if (!value) return
    for (const cell of tags(body, 'w:tc')) {
      if (!textOf(cell).includes(label)) continue
      for (const p of tags(cell, 'w:p')) {
        if (textOf(p).includes(label)) {
          paragraphAfter(doc, p, value, refRunPr)
          return
        }
      }
    }
  }
  insertInsideCell('Техническое состояние', f.techCondition || '')
  insertInsideCell('Выполненые работы', f.performedWorks || '')

  let out = new XMLSerializer().serializeToString(doc)
  if (!out.startsWith('<?xml')) {
    out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + out
  }
  files['word/document.xml'] = new TextEncoder().encode(out)
  return zipSync(files)
}

/** День между кавычками, месяц прописью в последний run, год двумя ячейками «20» + «26». */
function writeHeaderDate(
  doc: Document,
  body: Element,
  d: { day: string; month: string; year: string },
  refRunPr: Element | null,
) {
  for (const row of tags(body, 'w:tr')) {
    const cells = cellsOf(row)
    const quoteIdx = cells.findIndex((c) => {
      const t = textOf(c)
      return t.includes('«') && t.includes('»')
    })
    if (quoteIdx === -1) continue

    const runs = tags(cells[quoteIdx], 'w:r')
    let between = false
    for (const r of runs) {
      for (const t of tags(r, 'w:t')) {
        const v = t.textContent ?? ''
        if (v.includes('«')) { between = true; continue }
        if (v.includes('»')) { between = false; continue }
        if (between) setText(doc, t, d.day)
      }
    }
    const monthRun = runs[runs.length - 1]
    if (monthRun) {
      const ts = tags(monthRun, 'w:t')
      if (ts.length) setText(doc, ts[ts.length - 1], d.month)
    }

    for (let i = quoteIdx + 1; i < cells.length; i += 1) {
      const t = textOf(cells[i]).trim()
      if (t.includes('года')) break
      if (!/^20\d{0,2}$/.test(t)) continue

      const mainRun = tags(cells[i], 'w:r')[0]
      const yearRunPr = mainRun ? (tags(mainRun, 'w:rPr')[0] ?? null) : refRunPr

      const putYear = (cell: Element, value: string) => {
        const p = firstParagraph(cell)
        if (!p) return
        const cellRuns = tags(p, 'w:r')
        if (cellRuns.length === 0) {
          const r = doc.createElementNS(W_NS, 'w:r')
          if (yearRunPr) r.appendChild(yearRunPr.cloneNode(true))
          const te = doc.createElementNS(W_NS, 'w:t')
          setText(doc, te, value)
          r.appendChild(te)
          p.appendChild(r)
          return
        }
        let te = tags(cellRuns[0], 'w:t')[0] as Element | undefined
        if (!te) {
          te = doc.createElementNS(W_NS, 'w:t')
          cellRuns[0].appendChild(te)
        }
        setText(doc, te, value)
      }

      // следующая ячейка пустая — «20» остаётся в этой, две цифры уходят в неё
      const suffixCell = cells[i + 1] ?? null
      if (suffixCell && textOf(suffixCell).trim() === '' && d.year.startsWith('20')) {
        putYear(cells[i], '20')
        putYear(suffixCell, d.year.slice(2))
      } else {
        putYear(cells[i], d.year)
      }
      break
    }
    break
  }
}
