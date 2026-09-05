import { useMemo } from 'react'
import { Icon } from '../ui'
import { useRepairs } from '../repairs/store'
import { STATUSES, STATUS_META } from '../repairs/types'
import { daysLabel, daysSince } from '../lib/date'

export function StatsPage() {
  const items = useRepairs((s) => s.items)

  const stats = useMemo(() => {
    const byStatus = STATUSES.map((status) => ({
      status,
      count: items.filter((r) => r.status === status).length,
    }))
    const active = items.filter((r) => STATUS_META[r.status].active)
    const closed = items.filter((r) => !STATUS_META[r.status].active)
    const avgActive = active.length
      ? Math.round(active.reduce((sum, r) => sum + daysSince(r.receivedAt), 0) / active.length)
      : 0

    const byLocation = new Map<string, number>()
    for (const r of items) {
      const key = r.location?.trim() || 'Не указана'
      byLocation.set(key, (byLocation.get(key) ?? 0) + 1)
    }
    const locations = [...byLocation.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)

    return { byStatus, active: active.length, closed: closed.length, avgActive, locations }
  }, [items])

  const max = Math.max(1, ...stats.byStatus.map((s) => s.count))
  const maxLoc = Math.max(1, ...stats.locations.map(([, n]) => n))

  return (
    <div className="stats-page">
      <div className="stats">
        <div className="stat" style={{ ['--stat-color' as string]: 'var(--text-1)' }}>
          <span className="stat__label">Всего заявок</span>
          <span className="stat__value">{items.length}</span>
        </div>
        <div className="stat" style={{ ['--stat-color' as string]: 'var(--st-progress)' }}>
          <span className="stat__label">В работе сейчас</span>
          <span className="stat__value">{stats.active}</span>
        </div>
        <div className="stat" style={{ ['--stat-color' as string]: 'var(--st-issued)' }}>
          <span className="stat__label">Закрыто</span>
          <span className="stat__value">{stats.closed}</span>
        </div>
        <div className="stat" style={{ ['--stat-color' as string]: 'var(--warn)' }}>
          <span className="stat__label">Средний срок в работе</span>
          <span className="stat__value" style={{ fontSize: 'var(--fs-xl)' }}>{daysLabel(stats.avgActive)}</span>
        </div>
      </div>

      <section className="card">
        <h3 className="card__title">
          <Icon name="chart" size={15} /> Распределение по статусам
        </h3>
        <div className="bars">
          {stats.byStatus.map(({ status, count }) => (
            <div className="bar" key={status}>
              <span style={{ color: 'var(--text-2)' }}>{STATUS_META[status].label}</span>
              <span className="bar__track">
                <span className="bar__fill" style={{ width: `${(count / max) * 100}%`, ['--bar-color' as string]: STATUS_META[status].color }} />
              </span>
              <span className="bar__num">{count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="card__title">
          <Icon name="mapPin" size={15} /> Откуда поступает чаще всего
        </h3>
        <div className="bars">
          {stats.locations.map(([name, count]) => (
            <div className="bar" key={name}>
              <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
                {name}
              </span>
              <span className="bar__track">
                <span className="bar__fill" style={{ width: `${(count / maxLoc) * 100}%`, ['--bar-color' as string]: 'var(--accent)' }} />
              </span>
              <span className="bar__num">{count}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
