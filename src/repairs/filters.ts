import { STATUS_META, type Repair, type RepairStatus } from './types'
import type { FilterKey, SortKey } from './store'

export function matchesQuery(repair: Repair, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [
    repair.number,
    repair.equipment,
    repair.serialNo,
    repair.fromWhom,
    repair.contact,
    repair.location,
    repair.problem,
    repair.notes,
  ]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q))
}

export function matchesFilter(repair: Repair, filter: FilterKey): boolean {
  if (filter === 'all') return true
  if (filter === 'active') return STATUS_META[repair.status].active
  return repair.status === filter
}

const STATUS_ORDER = Object.keys(STATUS_META) as RepairStatus[]

export function sortRepairs(rows: Repair[], key: SortKey, dir: 'asc' | 'desc'): Repair[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    let cmp = 0
    if (key === 'number') {
      const na = Number(a.number)
      const nb = Number(b.number)
      cmp =
        Number.isFinite(na) && Number.isFinite(nb)
          ? na - nb
          : a.number.localeCompare(b.number, 'ru', { numeric: true })
    }
    else if (key === 'receivedAt') cmp = a.receivedAt.localeCompare(b.receivedAt)
    else if (key === 'status') cmp = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    else cmp = String(a[key] ?? '').localeCompare(String(b[key] ?? ''), 'ru')
    return cmp * sign
  })
}

export function countByFilter(rows: Repair[]): Record<FilterKey, number> {
  const counts = { all: rows.length, active: 0 } as Record<FilterKey, number>
  for (const status of STATUS_ORDER) counts[status] = 0
  for (const row of rows) {
    counts[row.status] += 1
    if (STATUS_META[row.status].active) counts.active += 1
  }
  return counts
}
