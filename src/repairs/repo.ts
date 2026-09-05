import type { Attachment, AttachmentCategory, Repair, RepairDraft, RepairStatus, StatusEvent } from './types'

export interface ExportBundle {
  repairs: Repair[]
  events: StatusEvent[]
  files: Attachment[]
}

export interface RepairRepo {
  list(): Promise<Repair[]>
  get(id: number): Promise<Repair | null>
  create(draft: RepairDraft): Promise<Repair>
  update(id: number, patch: Partial<RepairDraft>): Promise<Repair>
  remove(id: number): Promise<void>
  setStatus(id: number, status: RepairStatus, comment?: string): Promise<Repair>
  history(id: number): Promise<StatusEvent[]>
  attachments(id: number): Promise<Attachment[]>
  addAttachment(id: number, file: File, category?: AttachmentCategory): Promise<Attachment>
  setCategory(attachmentId: number, category: AttachmentCategory): Promise<Attachment>
  removeAttachment(attachmentId: number): Promise<void>
  /** Обложка (первое изображение) для каждой заявки — для миниатюр в списке. */
  covers(): Promise<Record<number, string>>
  /** Удаляет все заявки вместе с историей и вложениями. */
  clearAll(): Promise<void>
  /** Заполняет базу демонстрационным набором заявок. */
  seedDemo(): Promise<void>
  /** Заявки вместе с историей и вложениями — для выгрузки. `ids` не задан — берутся все. */
  bundle(ids?: number[]): Promise<ExportBundle>
}

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let instance: RepairRepo | null = null

export async function getRepo(): Promise<RepairRepo> {
  if (instance) return instance
  if (isTauri()) {
    const { createSqliteRepo } = await import('./repo.sqlite')
    instance = await createSqliteRepo()
  } else {
    const { createMockRepo } = await import('./repo.mock')
    instance = createMockRepo()
  }
  return instance
}
