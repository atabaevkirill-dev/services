import type { RepairRepo } from './repo'
import {
  defaultCategory,
  kindOf,
  type Attachment,
  type Repair,
  type RepairStatus,
  type StatusEvent,
} from './types'
import { heicToJpeg, isHeic } from '../lib/heic'
import { blobUrl, clearBlobs, deleteBlob, forgetAllUrls, forgetUrl, putBlob } from '../lib/blobstore'

const KEY = 'services.mock.v1'

interface Snapshot {
  repairs: Repair[]
  events: StatusEvent[]
  files: Attachment[]
  seq: number
}

const daysAgo = (n: number, hour = 10): string => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 15, 0, 0)
  return d.toISOString()
}

const SEED: Array<Partial<Repair> & { equipment: string; status: RepairStatus; ago: number }> = [
  { equipment: 'Ноутбук Dell Latitude 5540', serialNo: 'CN0X7T92', fromWhom: 'Иванов А. В.', contact: '+7 912 445-11-08', location: 'Цех №2, участок сборки', problem: 'Не включается после залития жидкостью', notes: 'Снята клавиатура, чистка платы ультразвуком', status: 'in_progress', ago: 3 },
  { equipment: 'Принтер HP LaserJet M428', serialNo: 'VNC4K0217B', fromWhom: 'Бухгалтерия', contact: 'доб. 214', location: 'Офис, 3 этаж', problem: 'Зажёвывает бумагу, скрип при подаче', notes: 'Заказан ролик подачи RM2-5741, срок 5 дней', status: 'waiting_parts', ago: 6 },
  { equipment: 'Сварочный инвертор Ресанта САИ-250', serialNo: 'R250-0099412', fromWhom: 'Петров С. И.', contact: '+7 908 220-73-41', location: 'Склад ГСМ', problem: 'Срабатывает защита под нагрузкой', notes: 'Пробит силовой ключ, нужен аналог IGBT', status: 'waiting_parts', ago: 21 },
  { equipment: 'Монитор LG 27UP650', serialNo: '104NTLK9C721', fromWhom: 'Сидоров К. П.', contact: '+7 900 133-90-22', location: 'Цех №1, диспетчерская', problem: 'Мерцание, самопроизвольное отключение', notes: 'Заменены вздутые конденсаторы в блоке питания', status: 'done', ago: 9 },
  { equipment: 'Шуруповёрт Makita DDF484', serialNo: 'MK-2291045', fromWhom: 'Бригада №4', contact: null, location: 'Монтажный участок', problem: 'Не держит патрон, люфт вала', status: 'diagnostics', ago: 1 },
  { equipment: 'Компрессор Fubag B4000B', serialNo: 'FB40-77120', fromWhom: 'Кузнецов Д. А.', contact: '+7 917 604-55-19', location: 'Покрасочная камера', problem: 'Не набирает давление выше 4 бар', status: 'accepted', ago: 0 },
  { equipment: 'ИБП APC Smart-UPS 1500', serialNo: 'AS1834112956', fromWhom: 'Серверная', contact: 'доб. 101', location: 'Серверная, стойка 2', problem: 'Пищит, не переходит на батарею', notes: 'Батареи выработали ресурс, требуется комплект RBC7', status: 'waiting_parts', ago: 12 },
  { equipment: 'Станок ЧПУ фрезерный, шпиндель', serialNo: 'SP-2.2KW-0431', fromWhom: 'Участок ЧПУ', contact: 'Гончаров, доб. 340', location: 'Цех №3', problem: 'Биение шпинделя, посторонний шум', notes: 'Заменены подшипники, идёт обкатка', status: 'in_progress', ago: 5 },
  { equipment: 'Тепловизор Fluke Ti32', serialNo: 'TI32-99120', fromWhom: 'Отдел энергетики', contact: '+7 903 811-24-60', location: 'Энергоучасток', problem: 'Не фокусируется, ошибка объектива', status: 'rejected', ago: 30, notes: 'Ремонт нецелесообразен, стоимость выше 70% нового' },
  { equipment: 'Пылесос промышленный Karcher NT 30', serialNo: 'KA30-118842', fromWhom: 'Хозяйственный отдел', contact: null, location: 'Склад инвентаря', problem: 'Слабая тяга, перегрев мотора', status: 'issued', ago: 18 },
  { equipment: 'Ноутбук Lenovo ThinkPad T14', serialNo: 'PF3K21LM', fromWhom: 'Морозова Е. С.', contact: '+7 962 447-01-73', location: 'Отдел кадров', problem: 'Не заряжается, греется разъём', notes: 'Заменён разъём питания, тест 8 часов пройден', status: 'done', ago: 4 },
  { equipment: 'Сканер штрих-кода Zebra DS2208', serialNo: 'ZB2208-4471', fromWhom: 'Склад готовой продукции', contact: 'доб. 178', location: 'Склад, зона отгрузки', problem: 'Не читает коды, тусклый луч', status: 'accepted', ago: 2 },
  { equipment: 'Углошлифовальная машина Bosch GWS 22', serialNo: 'BS22-660183', fromWhom: 'Бригада №2', contact: null, location: 'Заготовительный участок', problem: 'Искрение щёток, падает обороты', notes: 'Заменены щётки и подшипник ротора', status: 'issued', ago: 25 },
  { equipment: 'Сервер Supermicro, блок питания', serialNo: 'SM-PWS-920P', fromWhom: 'ИТ-отдел', contact: 'доб. 101', location: 'Серверная, стойка 1', problem: 'Второй БП не выходит в резерв', status: 'diagnostics', ago: 7 },
]

function seed(): Snapshot {
  const repairs: Repair[] = []
  const events: StatusEvent[] = []
  let seq = 100
  let eventId = 1

  SEED.forEach((row, index) => {
    const id = index + 1
    const receivedAt = daysAgo(row.ago, 9 + (index % 7))
    const number = String(seq++)
    const repair: Repair = {
      id,
      number,
      receivedAt,
      equipment: row.equipment,
      serialNo: row.serialNo ?? null,
      fromWhom: row.fromWhom ?? null,
      contact: row.contact ?? null,
      location: row.location ?? null,
      problem: row.problem ?? null,
      status: row.status,
      notes: row.notes ?? null,
      issuedAt: row.status === 'issued' ? daysAgo(Math.max(0, row.ago - 6), 16) : null,
      createdAt: receivedAt,
      updatedAt: daysAgo(Math.max(0, Math.floor(row.ago / 2))),
    }
    repairs.push(repair)

    const chain: RepairStatus[] = ['accepted']
    if (row.status !== 'accepted') {
      const order: RepairStatus[] = ['diagnostics', 'waiting_parts', 'in_progress', 'done', 'issued']
      if (row.status === 'rejected') chain.push('diagnostics', 'rejected')
      else chain.push(...order.slice(0, order.indexOf(row.status) + 1))
    }
    chain.forEach((status, step) => {
      events.push({
        id: eventId++,
        repairId: id,
        fromStatus: step === 0 ? null : chain[step - 1],
        toStatus: status,
        comment: step === 0 ? 'Оборудование принято в ремонт' : null,
        at: daysAgo(Math.max(0, row.ago - step * 2), 11 + step),
      })
    })
  })

  return { repairs, events, files: [], seq }
}

function load(): Snapshot {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Snapshot>
      if (Array.isArray(parsed.repairs) && Array.isArray(parsed.events)) {
        return { repairs: parsed.repairs, events: parsed.events, files: parsed.files ?? [], seq: parsed.seq ?? 100 }
      }
    }
  } catch {
    /* пустое или повреждённое хранилище — пересеваем демо-данные */
  }
  const fresh = seed()
  save(fresh)
  return fresh
}

function save(s: Snapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* квота исчерпана: данные останутся только в памяти сессии */
  }
}

const nextId = (rows: { id: number }[]): number => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1

/** Сдвигает счётчик автонумерации выше номера, введённого вручную. */
function bumpSeq(db: Snapshot, number: string): void {
  const n = Number(number)
  if (Number.isFinite(n) && n >= db.seq) db.seq = Math.floor(n) + 1
}

const blobKey = (id: number) => `att-${id}`
const previewKey = (id: number) => `prev-${id}`

/** Метаданные лежат в снимке, содержимое — в IndexedDB; у старых записей src уже внутри. */
async function withSrc(file: Attachment): Promise<Attachment> {
  const src = file.src || (await blobUrl(blobKey(file.id)))
  const preview = file.preview ? await blobUrl(previewKey(file.id)) : ''
  return { ...file, src, preview, category: file.category ?? defaultCategory(file.kind) }
}

export function createMockRepo(): RepairRepo {
  let db = load()
  const commit = () => save(db)
  const find = (id: number) => db.repairs.find((r) => r.id === id)

  return {
    async list() {
      return [...db.repairs]
    },
    async get(id) {
      return find(id) ?? null
    },
    async create(draft) {
      const now = new Date().toISOString()
      const number = draft.number?.trim() || String(db.seq++)
      if (db.repairs.some((r) => r.number === number)) throw new Error(`Заявка с номером ${number} уже есть`)
      bumpSeq(db, number)
      const repair: Repair = {
        ...draft,
        number,
        id: nextId(db.repairs),
        createdAt: now,
        updatedAt: now,
      }
      db.repairs.push(repair)
      db.events.push({
        id: nextId(db.events),
        repairId: repair.id,
        fromStatus: null,
        toStatus: repair.status,
        comment: 'Заявка создана',
        at: now,
      })
      commit()
      return repair
    },
    async update(id, patch) {
      const repair = find(id)
      if (!repair) throw new Error(`Заявка ${id} не найдена`)
      if (patch.number !== undefined) {
        const number = patch.number.trim()
        if (!number) throw new Error('Номер заявки не может быть пустым')
        if (db.repairs.some((r) => r.id !== id && r.number === number)) throw new Error(`Заявка с номером ${number} уже есть`)
        bumpSeq(db, number)
        patch = { ...patch, number }
      }
      Object.assign(repair, patch, { updatedAt: new Date().toISOString() })
      commit()
      return repair
    },
    async remove(id) {
      const doomed = db.files.filter((f) => f.repairId === id)
      db.repairs = db.repairs.filter((r) => r.id !== id)
      db.events = db.events.filter((e) => e.repairId !== id)
      db.files = db.files.filter((f) => f.repairId !== id)
      for (const f of doomed) {
        forgetUrl(blobKey(f.id))
        forgetUrl(previewKey(f.id))
        await deleteBlob(blobKey(f.id))
        await deleteBlob(previewKey(f.id))
      }
      commit()
    },
    async setStatus(id, status, comment) {
      const repair = find(id)
      if (!repair) throw new Error(`Заявка ${id} не найдена`)
      const now = new Date().toISOString()
      const from = repair.status
      if (from === status && !comment) return repair
      repair.status = status
      repair.updatedAt = now
      if (status === 'issued' && !repair.issuedAt) repair.issuedAt = now
      if (status !== 'issued') repair.issuedAt = null
      db.events.push({
        id: nextId(db.events),
        repairId: id,
        fromStatus: from,
        toStatus: status,
        comment: comment?.trim() || null,
        at: now,
      })
      commit()
      return repair
    },
    async history(id) {
      return db.events.filter((e) => e.repairId === id).sort((a, b) => b.at.localeCompare(a.at))
    },
    async attachments(id) {
      return Promise.all(db.files.filter((f) => f.repairId === id).map(withSrc))
    },
    async addAttachment(id, file, category) {
      const kind = kindOf(file.name, file.type)
      const item: Attachment = {
        id: nextId(db.files),
        repairId: id,
        fileName: file.name,
        mime: file.type,
        kind,
        category: category ?? defaultCategory(kind),
        size: file.size,
        src: '',
        preview: '',
        caption: null,
        addedAt: new Date().toISOString(),
      }
      await putBlob(blobKey(item.id), file)

      // HEIC с iPhone: рядом кладём JPEG для просмотра, оригинал остаётся нетронутым
      if (isHeic(file.name, file.type)) {
        const jpeg = await heicToJpeg(file)
        if (jpeg) {
          await putBlob(previewKey(item.id), jpeg)
          item.preview = 'jpeg'
        }
      }

      db.files.push(item)
      commit()
      return withSrc(item)
    },
    async setCategory(attachmentId, category) {
      const file = db.files.find((f) => f.id === attachmentId)
      if (!file) throw new Error('Файл не найден')
      file.category = category
      commit()
      return withSrc(file)
    },
    async removeAttachment(attachmentId) {
      db.files = db.files.filter((f) => f.id !== attachmentId)
      forgetUrl(blobKey(attachmentId))
      forgetUrl(previewKey(attachmentId))
      await deleteBlob(blobKey(attachmentId))
      await deleteBlob(previewKey(attachmentId))
      commit()
    },
    async covers() {
      const map: Record<number, string> = {}
      for (const f of db.files) {
        if (f.kind !== 'image' || f.repairId in map) continue
        map[f.repairId] = f.preview ? await blobUrl(previewKey(f.id)) : f.src || (await blobUrl(blobKey(f.id)))
      }
      return map
    },
    async clearAll() {
      db = { repairs: [], events: [], files: [], seq: 100 }
      forgetAllUrls()
      await clearBlobs()
      commit()
    },
    async seedDemo() {
      db = seed()
      commit()
    },
    async bundle(ids) {
      // в отчёт идут только метаданные файлов — содержимое не выгружается
      // порядок ids задаёт порядок строк в отчёте — он совпадает с сортировкой на экране
      const repairs = ids
        ? ids.map((id) => db.repairs.find((r) => r.id === id)).filter((r): r is Repair => Boolean(r))
        : [...db.repairs]
      const keep = new Set(repairs.map((r) => r.id))
      return {
        repairs,
        events: db.events.filter((e) => keep.has(e.repairId)),
        files: db.files.filter((f) => keep.has(f.repairId)),
      }
    },
  }
}
