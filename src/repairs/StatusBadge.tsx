import { STATUS_META, type RepairStatus } from './types'

export function StatusBadge({ status, short = false }: { status: RepairStatus; short?: boolean }) {
  const meta = STATUS_META[status]
  return (
    <span className="badge" style={{ ['--badge-color' as string]: meta.color }}>
      <span className="badge__dot" />
      {short ? meta.short : meta.label}
    </span>
  )
}
