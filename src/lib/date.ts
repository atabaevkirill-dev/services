export type DateFormat = 'dd.mm' | 'dd.mm.yyyy' | 'iso'

export function formatDate(iso: string | null, fmt: DateFormat = 'dd.mm'): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  if (fmt === 'iso') return `${yyyy}-${mm}-${dd}`
  if (fmt === 'dd.mm.yyyy') return `${dd}.${mm}.${yyyy}`
  return `${dd}.${mm}`
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `${formatDate(iso, 'dd.mm.yyyy')}, ${time}`
}

export function daysSince(iso: string): number {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000))
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

export function daysLabel(n: number): string {
  return `${n} ${plural(n, 'день', 'дня', 'дней')}`
}

export function toDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function fromDateInput(value: string): string | null {
  if (!value) return null
  const d = new Date(`${value}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
