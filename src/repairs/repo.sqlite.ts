import type { ExportBundle, RepairRepo } from './repo'
import {
  defaultCategory,
  kindOf,
  type Attachment,
  type AttachmentCategory,
  type Repair,
  type RepairStatus,
  type StatusEvent,
} from './types'
import { heicToJpeg, isHeic } from '../lib/heic'
import { DEMO_ROWS, daysAgo, statusChain } from './demo'

type Row = Record<string, unknown>

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))

function toRepair(r: Row): Repair {
  return {
    id: Number(r.id),
    number: String(r.number),
    receivedAt: String(r.received_at),
    equipment: String(r.equipment),
    serialNo: str(r.serial_no),
    fromWhom: str(r.from_whom),
    contact: str(r.contact),
    location: str(r.location),
    problem: str(r.problem),
    status: String(r.status) as RepairStatus,
    notes: str(r.notes),
    issuedAt: str(r.issued_at),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }
}

function toEvent(r: Row): StatusEvent {
  return {
    id: Number(r.id),
    repairId: Number(r.repair_id),
    fromStatus: (str(r.from_status) as RepairStatus | null) ?? null,
    toStatus: String(r.to_status) as RepairStatus,
    comment: str(r.comment),
    at: String(r.at),
  }
}

/**
 * Настольная реализация: заявки в SQLite, файлы — в подпапке `files` каталога
 * данных приложения. Наружу отдаются asset-ссылки, пригодные для <img>, <video>
 * и открытия во внешней программе.
 */
export async function createSqliteRepo(): Promise<RepairRepo> {
  const [{ default: Database }, fs, path, core] = await Promise.all([
    import('@tauri-apps/plugin-sql'),
    import('@tauri-apps/plugin-fs'),
    import('@tauri-apps/api/path'),
    import('@tauri-apps/api/core'),
  ])

  const db = await Database.load('sqlite:services.db')
  const dataDir = await path.appDataDir()
  const filesDir = await path.join(dataDir, 'files')
  await fs.mkdir(filesDir, { recursive: true }).catch(() => undefined)

  const select = <T>(sql: string, args: unknown[] = []) => db.select<T[]>(sql, args)
  const fileUrl = async (stored: string) => core.convertFileSrc(await path.join(filesDir, stored))
  const notify = () => core.invoke('notify_changed').catch(() => undefined)

  const ext = (name: string) => {
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.slice(dot) : ''
  }
  const unique = (name: string) => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext(name)}`

  async function toAttachment(r: Row): Promise<Attachment> {
    const kind = String(r.kind) as Attachment['kind']
    return {
      id: Number(r.id),
      repairId: Number(r.repair_id),
      fileName: String(r.file_name),
      mime: String(r.mime ?? ''),
      kind,
      category: (str(r.category) as AttachmentCategory) ?? defaultCategory(kind),
      size: Number(r.size ?? 0),
      src: await fileUrl(String(r.stored_as)),
      preview: r.preview_as ? await fileUrl(String(r.preview_as)) : '',
      path: await path.join(filesDir, String(r.stored_as)),
      caption: str(r.caption),
      addedAt: String(r.added_at),
    }
  }

  const nextNumber = async (): Promise<string> => {
    const rows = await select<{ n: number | null }>(
      "SELECT MAX(CAST(number AS INTEGER)) AS n FROM repairs WHERE number GLOB '[0-9]*'",
    )
    return String(Math.max(99, rows[0]?.n ?? 99) + 1)
  }

  const requireFree = async (number: string, exceptId?: number) => {
    const rows = await select<{ id: number }>('SELECT id FROM repairs WHERE number = ?', [number])
    if (rows.some((r) => r.id !== exceptId)) throw new Error(`Заявка с номером ${number} уже есть`)
  }

  const repo: RepairRepo = {
    async list() {
      return (await select<Row>('SELECT * FROM repairs ORDER BY received_at DESC')).map(toRepair)
    },

    async get(id) {
      const rows = await select<Row>('SELECT * FROM repairs WHERE id = ?', [id])
      return rows[0] ? toRepair(rows[0]) : null
    },

    async create(draft) {
      const now = new Date().toISOString()
      const number = draft.number?.trim() || (await nextNumber())
      await requireFree(number)
      const res = await db.execute(
        `INSERT INTO repairs (number, received_at, equipment, serial_no, from_whom, contact, location,
           problem, status, notes, issued_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          number, draft.receivedAt, draft.equipment, draft.serialNo, draft.fromWhom, draft.contact,
          draft.location, draft.problem, draft.status, draft.notes, draft.issuedAt, now, now,
        ],
      )
      const id = Number(res.lastInsertId)
      await db.execute('INSERT INTO status_events (repair_id, from_status, to_status, comment, at) VALUES (?,?,?,?,?)', [
        id, null, draft.status, 'Заявка создана', now,
      ])
      await notify()
      const created = await repo.get(id)
      if (!created) throw new Error('Заявка создана, но не читается')
      return created
    },

    async update(id, patch) {
      const current = await repo.get(id)
      if (!current) throw new Error(`Заявка ${id} не найдена`)
      if (patch.number !== undefined) {
        const number = patch.number.trim()
        if (!number) throw new Error('Номер заявки не может быть пустым')
        await requireFree(number, id)
      }
      const next = { ...current, ...patch, number: patch.number?.trim() ?? current.number }
      await db.execute(
        `UPDATE repairs SET number=?, received_at=?, equipment=?, serial_no=?, from_whom=?, contact=?,
           location=?, problem=?, status=?, notes=?, issued_at=?, updated_at=? WHERE id=?`,
        [
          next.number, next.receivedAt, next.equipment, next.serialNo, next.fromWhom, next.contact,
          next.location, next.problem, next.status, next.notes, next.issuedAt, new Date().toISOString(), id,
        ],
      )
      await notify()
      return next
    },

    async remove(id) {
      const files = await select<Row>('SELECT stored_as, preview_as FROM attachments WHERE repair_id = ?', [id])
      for (const f of files) {
        await fs.remove(await path.join(filesDir, String(f.stored_as))).catch(() => undefined)
        if (f.preview_as) await fs.remove(await path.join(filesDir, String(f.preview_as))).catch(() => undefined)
      }
      await db.execute('DELETE FROM attachments WHERE repair_id = ?', [id])
      await db.execute('DELETE FROM status_events WHERE repair_id = ?', [id])
      await db.execute('DELETE FROM repairs WHERE id = ?', [id])
      await notify()
    },

    async setStatus(id, status, comment) {
      const current = await repo.get(id)
      if (!current) throw new Error(`Заявка ${id} не найдена`)
      if (current.status === status && !comment) return current
      const now = new Date().toISOString()
      const issuedAt = status === 'issued' ? (current.issuedAt ?? now) : null
      await db.execute('UPDATE repairs SET status=?, issued_at=?, updated_at=? WHERE id=?', [status, issuedAt, now, id])
      await db.execute('INSERT INTO status_events (repair_id, from_status, to_status, comment, at) VALUES (?,?,?,?,?)', [
        id, current.status, status, comment?.trim() || null, now,
      ])
      await notify()
      return { ...current, status, issuedAt, updatedAt: now }
    },

    async history(id) {
      return (await select<Row>('SELECT * FROM status_events WHERE repair_id = ? ORDER BY at DESC, id DESC', [id])).map(toEvent)
    },

    async attachments(id) {
      const rows = await select<Row>('SELECT * FROM attachments WHERE repair_id = ? ORDER BY id', [id])
      return Promise.all(rows.map(toAttachment))
    },

    async addAttachment(id, file, category) {
      const kind = kindOf(file.name, file.type)
      const stored = unique(file.name)
      await fs.writeFile(await path.join(filesDir, stored), new Uint8Array(await file.arrayBuffer()))

      let preview: string | null = null
      if (isHeic(file.name, file.type)) {
        const jpeg = await heicToJpeg(file)
        if (jpeg) {
          preview = `${stored}.jpg`
          await fs.writeFile(await path.join(filesDir, preview), new Uint8Array(await jpeg.arrayBuffer()))
        }
      }

      const res = await db.execute(
        `INSERT INTO attachments (repair_id, file_name, stored_as, preview_as, mime, kind, category, size, caption, added_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, file.name, stored, preview, file.type, kind, category ?? defaultCategory(kind), file.size, null, new Date().toISOString()],
      )
      await notify()
      const rows = await select<Row>('SELECT * FROM attachments WHERE id = ?', [Number(res.lastInsertId)])
      return toAttachment(rows[0])
    },

    async setCategory(attachmentId, category) {
      await db.execute('UPDATE attachments SET category = ? WHERE id = ?', [category, attachmentId])
      await notify()
      const rows = await select<Row>('SELECT * FROM attachments WHERE id = ?', [attachmentId])
      if (!rows[0]) throw new Error('Файл не найден')
      return toAttachment(rows[0])
    },

    async removeAttachment(attachmentId) {
      const rows = await select<Row>('SELECT stored_as, preview_as FROM attachments WHERE id = ?', [attachmentId])
      const row = rows[0]
      if (row) {
        await fs.remove(await path.join(filesDir, String(row.stored_as))).catch(() => undefined)
        if (row.preview_as) await fs.remove(await path.join(filesDir, String(row.preview_as))).catch(() => undefined)
      }
      await db.execute('DELETE FROM attachments WHERE id = ?', [attachmentId])
      await notify()
    },

    async covers() {
      const rows = await select<Row>(
        "SELECT repair_id, stored_as, preview_as FROM attachments WHERE kind = 'image' ORDER BY id",
      )
      const map: Record<number, string> = {}
      for (const r of rows) {
        const key = Number(r.repair_id)
        if (key in map) continue
        map[key] = await fileUrl(String(r.preview_as ?? r.stored_as))
      }
      return map
    },

    async clearAll() {
      const rows = await select<Row>('SELECT stored_as, preview_as FROM attachments')
      for (const r of rows) {
        await fs.remove(await path.join(filesDir, String(r.stored_as))).catch(() => undefined)
        if (r.preview_as) await fs.remove(await path.join(filesDir, String(r.preview_as))).catch(() => undefined)
      }
      await db.execute('DELETE FROM attachments')
      await db.execute('DELETE FROM status_events')
      await db.execute('DELETE FROM repairs')
      await notify()
    },

    async seedDemo() {
      await repo.clearAll()
      let number = 100
      for (const row of DEMO_ROWS) {
        const receivedAt = daysAgo(row.ago, 9)
        const now = new Date().toISOString()
        const res = await db.execute(
          `INSERT INTO repairs (number, received_at, equipment, serial_no, from_whom, contact, location,
             problem, status, notes, issued_at, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            String(number++), receivedAt, row.equipment, row.serialNo ?? null, row.fromWhom ?? null,
            row.contact ?? null, row.location ?? null, row.problem ?? null, row.status, row.notes ?? null,
            row.status === 'issued' ? daysAgo(Math.max(0, row.ago - 6), 16) : null, receivedAt, now,
          ],
        )
        const id = Number(res.lastInsertId)
        const chain = statusChain(row.status)
        for (let step = 0; step < chain.length; step += 1) {
          await db.execute('INSERT INTO status_events (repair_id, from_status, to_status, comment, at) VALUES (?,?,?,?,?)', [
            id,
            step === 0 ? null : chain[step - 1],
            chain[step],
            step === 0 ? 'Оборудование принято в ремонт' : null,
            daysAgo(Math.max(0, row.ago - step * 2), 11 + step),
          ])
        }
      }
      await notify()
    },

    async bundle(ids) {
      const all = await repo.list()
      const repairs = ids
        ? ids.map((id) => all.find((r) => r.id === id)).filter((r): r is Repair => Boolean(r))
        : all
      const keep = new Set(repairs.map((r) => r.id))
      const events = (await select<Row>('SELECT * FROM status_events')).map(toEvent).filter((e) => keep.has(e.repairId))
      const files = await Promise.all((await select<Row>('SELECT * FROM attachments')).map(toAttachment))
      return { repairs, events, files: files.filter((f) => keep.has(f.repairId)) } satisfies ExportBundle
    },
  }

  return repo
}
