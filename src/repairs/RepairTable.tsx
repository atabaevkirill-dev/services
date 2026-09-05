import { useMemo } from 'react'
import { EmptyState, Icon } from '../ui'
import { useSettings } from '../settings/store'
import { useWindowWidth } from '../lib/useWidth'
import { useRepairs, type SortKey } from './store'
import { matchesFilter, matchesQuery, sortRepairs } from './filters'
import { STATUS_META, type Repair } from './types'
import { daysLabel, daysSince, formatDate } from '../lib/date'
import { StatusBadge } from './StatusBadge'

export function useVisibleRepairs(): Repair[] {
  const { items, query, filter, sortKey, sortDir } = useRepairs()
  return useMemo(
    () => sortRepairs(items.filter((r) => matchesFilter(r, filter) && matchesQuery(r, query)), sortKey, sortDir),
    [items, query, filter, sortKey, sortDir],
  )
}

function HeadCell({ label, sortKey }: { label: string; sortKey?: SortKey }) {
  const { sortKey: active, sortDir, toggleSort } = useRepairs()
  if (!sortKey) return <span>{label}</span>
  const on = active === sortKey
  return (
    <button className="table__sort" data-dir={on ? sortDir : undefined} onClick={() => toggleSort(sortKey)}>
      {label}
      {on && <Icon name="chevronDown" size={12} />}
    </button>
  )
}

/** Набор колонок подбирается под ширину окна: узкое окно прячет второстепенное в подстроку. */
function useColumns() {
  const width = useWindowWidth()
  const showNotes = useSettings((s) => s.showNotes)
  const selectedId = useRepairs((s) => s.selectedId)
  const usable = selectedId !== null ? width - 430 : width

  const notes = showNotes && usable >= 1180
  const from = usable >= 860
  const num = usable >= 620
  const date = usable >= 520

  const cols = [
    '30px',
    num ? '48px' : '',
    'minmax(0, 2.2fr)',
    from ? 'minmax(0, 1.35fr)' : '',
    notes ? 'minmax(0, 1.5fr)' : '',
    date ? '84px' : '',
    usable >= 620 ? '124px' : '96px',
  ]
    .filter(Boolean)
    .join(' ')

  return { notes, from, num, date, cols }
}

export function RepairTable() {
  const rows = useVisibleRepairs()
  const { selectedId, select, loading, covers, checked, toggleCheck, setChecked } = useRepairs()
  const { showSerial, showThumbs, dateFormat, longRepairDays } = useSettings()
  const c = useColumns()
  const allChecked = rows.length > 0 && rows.every((r) => checked.includes(r.id))

  if (!loading && rows.length === 0) {
    return (
      <div className="table" style={{ ['--cols' as string]: c.cols }}>
        <EmptyState title="Заявок не найдено" hint="Измените фильтр или поисковый запрос" />
      </div>
    )
  }

  return (
    <div className="table" style={{ ['--cols' as string]: c.cols }}>
      <div className="table__head">
        <input
          className="check"
          type="checkbox"
          checked={allChecked}
          ref={(el) => {
            if (el) el.indeterminate = !allChecked && rows.some((r) => checked.includes(r.id))
          }}
          onChange={() => setChecked(allChecked ? [] : rows.map((r) => r.id))}
          aria-label="Выбрать все заявки в списке"
        />
        {c.num && <HeadCell label="№" sortKey="number" />}
        <HeadCell label="Оборудование" sortKey="equipment" />
        {c.from && <HeadCell label="От кого · локация" sortKey="fromWhom" />}
        {c.notes && <HeadCell label="Примечания" />}
        {c.date && <HeadCell label="Принято" sortKey="receivedAt" />}
        <HeadCell label="Статус" sortKey="status" />
      </div>

      {rows.map((r) => {
        const age = daysSince(r.receivedAt)
        const isLong = STATUS_META[r.status].active && age >= longRepairDays
        const sub = [
          !c.num ? `№ ${r.number}` : '',
          showSerial && r.serialNo ? r.serialNo : '',
          !c.from ? [r.fromWhom, r.location].filter(Boolean).join(', ') : '',
          r.problem ?? '',
        ]
          .filter(Boolean)
          .join(' · ')

        return (
          <div
            key={r.id}
            className="table__row"
            data-on={r.id === selectedId}
            onClick={() => select(r.id === selectedId ? null : r.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && select(r.id)}
          >
            <input
              className="check"
              type="checkbox"
              checked={checked.includes(r.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleCheck(r.id)}
              aria-label={`Выбрать заявку № ${r.number}`}
            />
            {c.num && <span className="cell cell--num">{r.number}</span>}

            <span className="cell cell--eq">
              {showThumbs && (
                <span className="thumb" data-empty={!covers[r.id]}>
                  {covers[r.id] ? <img src={covers[r.id]} alt="" /> : <Icon name="package" size={14} />}
                </span>
              )}
              <span style={{ minWidth: 0 }}>
                <span className="cell__main">{r.equipment}</span>
                <span className="cell__sub">{sub || '—'}</span>
              </span>
            </span>

            {c.from && (
              <span className="cell">
                <span className="cell__main" style={{ fontWeight: 400 }}>
                  {r.fromWhom ?? '—'}
                </span>
                <span className="cell__sub">{r.location ?? '—'}</span>
              </span>
            )}

            {c.notes && (
              <span className="cell">
                <span className="cell__sub" style={{ marginTop: 0, color: 'var(--text-2)' }}>
                  {r.notes ?? '—'}
                </span>
              </span>
            )}

            {c.date && (
              <span className="cell cell--date">
                {formatDate(r.receivedAt, dateFormat)}
                <span className="cell__age" data-long={isLong}>
                  {daysLabel(age)}
                </span>
              </span>
            )}

            <span className="cell">
              <StatusBadge status={r.status} short />
            </span>
          </div>
        )
      })}
    </div>
  )
}
