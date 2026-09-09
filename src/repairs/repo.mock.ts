import type { RepairRepo } from './repo'
import {
  defaultCategory,
  kindOf,
  type Attachment,
  type Repair,
  type StatusEvent,
} from './types'
import { heicToJpeg, isHeic } from '../lib/heic'
import { DEMO_ROWS, daysAgo, statusChain } from './demo'
import { blobUrl, clearBlobs, deleteBlob, forgetAllUrls, forgetUrl, putBlob } from '../lib/blobstore'

const KEY = 'services.mock.v1'

interface Snapshot {
  repairs: Repair[]
  events: StatusEvent[]
  files: Attachment[]
  seq: number
}

function seed(): Snapshot {
  const repairs: Repair[] = []
  const events: StatusEvent[] = []
  let seq = 100
  let eventId = 1

  DEMO_ROWS.forEach((row, index) => {
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

    const chain = statusChain(row.status)
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
        path: null,
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
