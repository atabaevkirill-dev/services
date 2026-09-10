import { create } from 'zustand'
import { getRepo, type ExportBundle } from './repo'
import type { Attachment, AttachmentCategory, Repair, RepairDraft, RepairStatus, StatusEvent } from './types'

export type FilterKey = 'all' | 'active' | RepairStatus
export type SortKey = 'number' | 'receivedAt' | 'equipment' | 'status' | 'fromWhom'

interface RepairsState {
  items: Repair[]
  loading: boolean
  error: string | null
  query: string
  filter: FilterKey
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  selectedId: number | null
  checked: number[]
  history: StatusEvent[]
  files: Attachment[]
  covers: Record<number, string>

  load(): Promise<void>
  select(id: number | null): Promise<void>
  refreshDetails(): Promise<void>
  create(draft: RepairDraft): Promise<Repair>
  update(id: number, patch: Partial<RepairDraft>): Promise<void>
  setStatus(id: number, status: RepairStatus, comment?: string): Promise<void>
  remove(id: number): Promise<void>
  addAttachment(id: number, file: File, category?: AttachmentCategory): Promise<Attachment>
  setCategory(attachmentId: number, category: AttachmentCategory): Promise<Attachment>
  removeAttachment(attachmentId: number): Promise<void>
  clearAll(): Promise<void>
  seedDemo(): Promise<void>
  bundle(ids?: number[]): Promise<ExportBundle>
  toggleCheck(id: number): void
  setChecked(ids: number[]): void
  setQuery(q: string): void
  setFilter(f: FilterKey): void
  toggleSort(key: SortKey): void
}

export const useRepairs = create<RepairsState>()((set, get) => ({
  items: [],
  loading: true,
  error: null,
  query: '',
  filter: 'all',
  sortKey: 'receivedAt',
  sortDir: 'desc',
  selectedId: null,
  checked: [],
  history: [],
  files: [],
  covers: {},

  async load() {
    try {
      const repo = await getRepo()
      const [items, covers] = await Promise.all([repo.list(), repo.covers()])
      set({ items, covers, loading: false, error: null })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Не удалось загрузить заявки' })
    }
  },

  async select(id) {
    set({ selectedId: id, history: [], files: [] })
    if (id !== null) await get().refreshDetails()
  },

  async refreshDetails() {
    const id = get().selectedId
    if (id === null) return
    const repo = await getRepo()
    const [history, files] = await Promise.all([repo.history(id), repo.attachments(id)])
    set({ history, files })
  },

  async create(draft) {
    const repo = await getRepo()
    const repair = await repo.create(draft)
    await get().load()
    return repair
  },

  async update(id, patch) {
    const repo = await getRepo()
    await repo.update(id, patch)
    await get().load()
    if (get().selectedId === id) await get().refreshDetails()
  },

  async setStatus(id, status, comment) {
    const repo = await getRepo()
    await repo.setStatus(id, status, comment)
    await get().load()
    if (get().selectedId === id) await get().refreshDetails()
  },

  async remove(id) {
    const repo = await getRepo()
    await repo.remove(id)
    set((s) => ({ checked: s.checked.filter((x) => x !== id) }))
    if (get().selectedId === id) set({ selectedId: null, history: [], files: [] })
    await get().load()
  },

  async addAttachment(id, file, category) {
    const repo = await getRepo()
    const added = await repo.addAttachment(id, file, category)
    await Promise.all([get().refreshDetails(), get().load()])
    return added
  },

  async setCategory(attachmentId, category) {
    const repo = await getRepo()
    const changed = await repo.setCategory(attachmentId, category)
    await Promise.all([get().refreshDetails(), get().load()])
    return changed
  },

  async removeAttachment(attachmentId) {
    const repo = await getRepo()
    await repo.removeAttachment(attachmentId)
    await Promise.all([get().refreshDetails(), get().load()])
  },

  async clearAll() {
    const repo = await getRepo()
    await repo.clearAll()
    set({ selectedId: null, checked: [], history: [], files: [] })
    await get().load()
  },

  async seedDemo() {
    const repo = await getRepo()
    await repo.seedDemo()
    set({ selectedId: null, checked: [], history: [], files: [] })
    await get().load()
  },

  async bundle(ids) {
    const repo = await getRepo()
    return repo.bundle(ids)
  },

  toggleCheck: (id) =>
    set((s) => ({ checked: s.checked.includes(id) ? s.checked.filter((x) => x !== id) : [...s.checked, id] })),
  setChecked: (checked) => set({ checked }),

  setQuery: (query) => set({ query }),
  setFilter: (filter) => set({ filter }),
  toggleSort: (key) =>
    set((s) => (s.sortKey === key ? { sortDir: s.sortDir === 'asc' ? 'desc' : 'asc' } : { sortKey: key, sortDir: 'asc' })),
}))
