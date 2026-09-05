import type { ExportBundle } from '../repairs/repo'
import { KIND_LABEL, STATUS_META } from '../repairs/types'
import { daysSince, formatDate, formatDateTime } from '../lib/date'
import { saveBlob, stamp } from '../lib/download'

const widths = (...w: number[]) => w.map((wch) => ({ wch }))

/** Выгружает заявки в .xlsx: три листа — заявки, история статусов, файлы. */
export async function exportToExcel(bundle: ExportBundle): Promise<void> {
  const XLSX = await import('xlsx')
  const { repairs, events, files } = bundle
  const byId = new Map(repairs.map((r) => [r.id, r]))
  const fileCount = new Map<number, number>()
  for (const f of files) fileCount.set(f.repairId, (fileCount.get(f.repairId) ?? 0) + 1)

  const sheetRepairs = repairs.map((r) => ({
    '№': r.number,
    Поступило: formatDate(r.receivedAt, 'dd.mm.yyyy'),
    'Дней в ремонте': daysSince(r.receivedAt),
    Оборудование: r.equipment,
    'Серийный / инв. номер': r.serialNo ?? '',
    'От кого': r.fromWhom ?? '',
    Контакт: r.contact ?? '',
    Локация: r.location ?? '',
    Неисправность: r.problem ?? '',
    Статус: STATUS_META[r.status].label,
    Примечания: r.notes ?? '',
    Выдано: r.issuedAt ? formatDate(r.issuedAt, 'dd.mm.yyyy') : '',
    Файлов: fileCount.get(r.id) ?? 0,
    Обновлено: formatDateTime(r.updatedAt),
  }))

  const sheetEvents = [...events]
    .sort((a, b) => a.repairId - b.repairId || a.at.localeCompare(b.at))
    .map((e) => ({
      '№ заявки': byId.get(e.repairId)?.number ?? e.repairId,
      Оборудование: byId.get(e.repairId)?.equipment ?? '',
      'Из статуса': e.fromStatus ? STATUS_META[e.fromStatus].label : '',
      'В статус': STATUS_META[e.toStatus].label,
      Дата: formatDateTime(e.at),
      Комментарий: e.comment ?? '',
    }))

  const sheetFiles = files.map((f) => ({
    '№ заявки': byId.get(f.repairId)?.number ?? f.repairId,
    Оборудование: byId.get(f.repairId)?.equipment ?? '',
    Файл: f.fileName,
    Тип: KIND_LABEL[f.kind],
    'Размер, КБ': Math.max(1, Math.round(f.size / 1024)),
    Добавлен: formatDateTime(f.addedAt),
  }))

  const book = XLSX.utils.book_new()

  const s1 = XLSX.utils.json_to_sheet(sheetRepairs)
  s1['!cols'] = widths(8, 12, 14, 34, 20, 22, 20, 26, 40, 16, 40, 12, 9, 18)
  s1['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 13, r: Math.max(1, repairs.length) } }) }
  s1['!freeze'] = { xSplit: 0, ySplit: 1 }
  XLSX.utils.book_append_sheet(book, s1, 'Заявки')

  const s2 = XLSX.utils.json_to_sheet(sheetEvents.length ? sheetEvents : [{ '№ заявки': '', Оборудование: '', 'Из статуса': '', 'В статус': '', Дата: '', Комментарий: '' }])
  s2['!cols'] = widths(10, 34, 16, 16, 20, 40)
  XLSX.utils.book_append_sheet(book, s2, 'История статусов')

  const s3 = XLSX.utils.json_to_sheet(sheetFiles.length ? sheetFiles : [{ '№ заявки': '', Оборудование: '', Файл: '', Тип: '', 'Размер, КБ': '', Добавлен: '' }])
  s3['!cols'] = widths(10, 34, 34, 14, 12, 20)
  XLSX.utils.book_append_sheet(book, s3, 'Файлы')

  const data = XLSX.write(book, { bookType: 'xlsx', type: 'array' })
  await saveBlob(`Заявки_${stamp()}.xlsx`, new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}
