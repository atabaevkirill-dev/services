import { useEffect, useMemo } from 'react'
import { Button, Icon, EmptyState } from '../ui'
import { useSettings } from '../settings/store'
import { useRepairs } from '../repairs/store'
import { STATUS_META } from '../repairs/types'
import { daysSince } from '../lib/date'
import { openMainWindow } from '../lib/shell'
import './widget.css'

export function WidgetPanel() {
  const { items, load, loading } = useRepairs()
  const { longRepairDays, widgetOpacity } = useSettings()

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 30_000)
    return () => window.clearInterval(timer)
  }, [load])

  const active = useMemo(
    () =>
      items
        .filter((r) => STATUS_META[r.status].active)
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)),
    [items],
  )

  const counts = useMemo(
    () => ({
      work: items.filter((r) => r.status === 'in_progress' || r.status === 'diagnostics').length,
      parts: items.filter((r) => r.status === 'waiting_parts').length,
      done: items.filter((r) => r.status === 'done').length,
    }),
    [items],
  )

  return (
    <div className="wg" style={{ opacity: widgetOpacity / 100 }}>
      <div className="wg__bar" data-tauri-drag-region>
        <span className="wg__logo">
          <Icon name="wrench" size={13} />
        </span>
        <span className="wg__title">Ремонт оборудования</span>
        <span style={{ flex: 1 }} />
        <button className="wg__btn" title="Открыть окно" aria-label="Открыть окно" onClick={() => void openMainWindow()}>
          <Icon name="maximize" size={13} />
        </button>
      </div>

      <div className="wg__stats">
        <div className="wg__stat" style={{ ['--wg-color' as string]: 'var(--st-progress)' }}>
          <span>В работе</span>
          <strong>{counts.work}</strong>
        </div>
        <div className="wg__stat" style={{ ['--wg-color' as string]: 'var(--st-waiting)' }}>
          <span>Ждут з/ч</span>
          <strong>{counts.parts}</strong>
        </div>
        <div className="wg__stat" style={{ ['--wg-color' as string]: 'var(--st-done)' }}>
          <span>Готово</span>
          <strong>{counts.done}</strong>
        </div>
      </div>

      <div className="wg__list">
        {loading && <div className="empty" style={{ padding: 24 }}>Загрузка…</div>}
        {!loading && active.length === 0 && <EmptyState icon="check" title="Активных заявок нет" />}
        {active.map((r) => {
          const age = daysSince(r.receivedAt)
          return (
            <button key={r.id} className="wg__item" onClick={() => void openMainWindow(r.id)}>
              <span className="wg__dot" style={{ ['--item-color' as string]: STATUS_META[r.status].color }} />
              <span style={{ minWidth: 0 }}>
                <span className="wg__name">{r.equipment}</span>
                <span className="wg__meta">
                  № {r.number} · {STATUS_META[r.status].short}
                  {r.location ? ` · ${r.location}` : ''}
                </span>
              </span>
              <span className="wg__age" data-long={age >= longRepairDays}>
                {age} д
              </span>
            </button>
          )
        })}
      </div>

      <div className="wg__foot">
        <Button size="sm" icon="maximize" onClick={() => void openMainWindow()} style={{ width: '100%' }}>
          Открыть полное окно
        </Button>
      </div>
    </div>
  )
}
