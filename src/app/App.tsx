import { useEffect, useMemo, useState } from 'react'
import { Button, Icon, type IconName } from '../ui'
import { useSettings } from '../settings/store'
import { SettingsPanel } from '../settings/SettingsPanel'
import { useRepairs, type FilterKey } from '../repairs/store'
import { RepairTable, useVisibleRepairs } from '../repairs/RepairTable'
import { RepairDetails } from '../repairs/RepairDetails'
import { RepairForm } from '../repairs/RepairForm'
import { countByFilter } from '../repairs/filters'
import { STATUS_META, STATUSES } from '../repairs/types'
import { daysSince } from '../lib/date'
import { subscribeChanges } from '../lib/sync'
import { StatsPage } from './StatsPage'
import { Report } from '../export/Report'
import { exportToExcel } from '../export/excel'
import { applyExtract } from '../akt/pipeline'
import { useActOptions } from '../akt/options'
import { useActResult } from '../akt/result'
import type { ExportBundle } from '../repairs/repo'
import './app.css'

type Page = 'repairs' | 'stats' | 'settings'

const NAV: { page: Page; icon: IconName; label: string }[] = [
  { page: 'repairs', icon: 'list', label: 'Заявки' },
  { page: 'stats', icon: 'chart', label: 'Статистика' },
  { page: 'settings', icon: 'settings', label: 'Настройки' },
]

export function App() {
  const [page, setPage] = useState<Page>('repairs')
  const [creating, setCreating] = useState(false)
  const [report, setReport] = useState<{ bundle: ExportBundle; scope: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const { themeMode, set: setSetting, longRepairDays } = useSettings()
  const actOptions = useActOptions()
  const putActResult = useActResult((s) => s.put)
  const {
    items, load, loading, error, query, setQuery, filter, setFilter, selectedId,
    create, addAttachment, select, checked, setChecked, bundle,
  } = useRepairs()

  useEffect(() => {
    void load()
    let stop = () => undefined as void
    void subscribeChanges({
      onChanged: () => void load(),
      onOpen: (id) => {
        setPage('repairs')
        void select(id)
      },
    }).then((off) => {
      stop = off
    })
    return () => stop()
  }, [load, select])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setPage('repairs')
        setCreating(true)
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        document.getElementById('search-input')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const counts = useMemo(() => countByFilter(items), [items])
  const visible = useVisibleRepairs()
  const selected = items.find((r) => r.id === selectedId) ?? null

  const longCount = useMemo(
    () => items.filter((r) => STATUS_META[r.status].active && daysSince(r.receivedAt) >= longRepairDays).length,
    [items, longRepairDays],
  )

  const filterLabel =
    filter === 'all' ? 'Все заявки' : filter === 'active' ? 'Активные заявки' : `Статус: ${STATUS_META[filter].label}`
  const exportIds = checked.length ? checked : visible.map((r) => r.id)
  const exportScope = checked.length
    ? `Выбрано вручную: ${checked.length} из ${items.length}`
    : `${filterLabel}${query.trim() ? ` · поиск «${query.trim()}»` : ''} — ${visible.length} из ${items.length}`

  const runExport = async (target: 'excel' | 'pdf') => {
    if (exportIds.length === 0) return
    setExporting(true)
    try {
      const data = await bundle(exportIds)
      if (target === 'excel') await exportToExcel(data)
      else setReport({ bundle: data, scope: exportScope })
    } finally {
      setExporting(false)
    }
  }

  const cards: { key: FilterKey; label: string; value: number; color: string }[] = [
    { key: 'active', label: 'В работе', value: counts.active, color: 'var(--st-progress)' },
    { key: 'waiting_parts', label: 'Ждут запчасти', value: counts.waiting_parts, color: 'var(--st-waiting)' },
    { key: 'done', label: 'Готово к выдаче', value: counts.done, color: 'var(--st-done)' },
    { key: 'all', label: 'Всего заявок', value: counts.all, color: 'var(--text-3)' },
  ]

  const title = page === 'repairs' ? 'Заявки в ремонте' : page === 'stats' ? 'Статистика' : 'Настройки'
  const subtitle =
    page === 'repairs'
      ? `${visible.length} из ${items.length}${longCount ? ` · ${longCount} дольше ${longRepairDays} дней` : ''}`
      : page === 'stats'
        ? 'Сводка по всем заявкам'
        : 'Оформление применяется сразу'

  return (
    <div className="shell">
      <nav className="rail">
        <span className="rail__logo">
          <Icon name="wrench" size={17} />
        </span>
        {NAV.map((n) => (
          <button
            key={n.page}
            className="rail__btn"
            data-on={page === n.page}
            title={n.label}
            aria-label={n.label}
            onClick={() => setPage(n.page)}
          >
            <Icon name={n.icon} size={18} />
          </button>
        ))}
        <span className="rail__spacer" />
        <button
          className="rail__btn"
          title="Сменить тему"
          aria-label="Сменить тему"
          onClick={() => setSetting('themeMode', themeMode === 'dark' ? 'light' : themeMode === 'light' ? 'auto' : 'dark')}
        >
          <Icon name={themeMode === 'dark' ? 'moon' : themeMode === 'light' ? 'sun' : 'monitor'} size={18} />
        </button>
      </nav>

      <main className="main" style={{ position: 'relative' }}>
        <header className="topbar">
          <div style={{ minWidth: 0 }}>
            <h1 className="topbar__title">{title}</h1>
            <p className="topbar__sub">{subtitle}</p>
          </div>
          <div style={{ flex: 1 }} />
          {page === 'repairs' && (
            <>
              <div className="search">
                <span className="search__icon">
                  <Icon name="search" size={15} />
                </span>
                <input
                  id="search-input"
                  className="input"
                  placeholder="Поиск: оборудование, номер, кто сдал…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <Button icon="refresh" onClick={() => void load()} aria-label="Обновить список" />
              <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
                Заявка
              </Button>
            </>
          )}
        </header>

        <div className="content">
          {error && (
            <div className="card" style={{ borderColor: 'var(--danger)', color: 'var(--danger)', marginBottom: 14 }}>
              {error}
            </div>
          )}

          {page === 'repairs' && (
            <>
              <div className="stats">
                {cards.map((c) => (
                  <button
                    key={c.key}
                    className="stat"
                    data-on={filter === c.key}
                    style={{ ['--stat-color' as string]: c.color }}
                    onClick={() => setFilter(filter === c.key ? 'all' : c.key)}
                  >
                    <span className="stat__label">{c.label}</span>
                    <span className="stat__value" style={c.key === 'all' ? { color: 'var(--text-1)' } : undefined}>{c.value}</span>
                    <span className="stat__bar" style={{ transform: `scaleX(${counts.all ? c.value / counts.all : 0})` }} />
                  </button>
                ))}
              </div>

              <div className="toolbar">
                <button className="chip" data-on={filter === 'all'} onClick={() => setFilter('all')}>
                  Все <span className="chip__count">{counts.all}</span>
                </button>
                <button className="chip" data-on={filter === 'active'} onClick={() => setFilter('active')}>
                  Активные <span className="chip__count">{counts.active}</span>
                </button>
                {STATUSES.map((s) => (
                  <button key={s} className="chip" data-on={filter === s} onClick={() => setFilter(s)}>
                    {STATUS_META[s].label} <span className="chip__count">{counts[s]}</span>
                  </button>
                ))}
                <span className="toolbar__spacer" />
                {query && (
                  <Button size="sm" variant="ghost" icon="x" onClick={() => setQuery('')}>
                    Сбросить поиск
                  </Button>
                )}
              </div>

              {checked.length > 0 && (
                <div className="bulk">
                  <Icon name="check" size={15} />
                  <span className="bulk__text">
                    Выбрано {checked.length} из {visible.length}
                  </span>
                  <span style={{ flex: 1 }} />
                  <Button size="sm" variant="ghost" onClick={() => setChecked(visible.map((r) => r.id))}>
                    Выбрать все
                  </Button>
                  <Button size="sm" variant="ghost" icon="x" onClick={() => setChecked([])}>
                    Снять выделение
                  </Button>
                </div>
              )}

              <div className="toolbar" style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>
                  Экспорт: {checked.length ? `выбранные (${checked.length})` : `видимые (${visible.length})`}
                </span>
                <Button size="sm" icon="download" disabled={exporting || exportIds.length === 0} onClick={() => void runExport('excel')}>
                  Excel
                </Button>
                <Button size="sm" icon="file" disabled={exporting || exportIds.length === 0} onClick={() => void runExport('pdf')}>
                  PDF
                </Button>
              </div>

              {loading ? <div className="empty">Загрузка…</div> : <RepairTable />}
            </>
          )}

          {page === 'stats' && <StatsPage />}
          {page === 'settings' && <SettingsPanel />}
        </div>

        {page === 'repairs' && selected && <RepairDetails repair={selected} />}
      </main>

      {report && (
        <Report
          bundle={report.bundle}
          scope={report.scope}
          longRepairDays={longRepairDays}
          onExcel={() => void exportToExcel(report.bundle)}
          onClose={() => setReport(null)}
        />
      )}

      {creating && (
        <RepairForm
          onClose={() => setCreating(false)}
          onSubmit={async (draft, files, act) => {
            const repair = await create(draft)
            if (act) await addAttachment(repair.id, act.file, 'act')
            for (const file of files) await addAttachment(repair.id, file)
            await select(repair.id)
            // акт уже распознан в форме: здесь остаются документы, папка
            // и заявки на остальные приборы
            if (act) {
              try {
                putActResult(repair.id, {
                  kind: 'running',
                  stage: 'Готовлю документы',
                  fileName: act.file.name,
                })
                const result = await applyExtract(
                  {
                    repairId: repair.id,
                    actBytes: act.bytes,
                    actFileName: act.file.name,
                    actMime: act.file.type,
                    extract: act.extract,
                    fillCurrent: false,
                  },
                  actOptions,
                  (stage) => putActResult(repair.id, { kind: 'running', stage, fileName: act.file.name }),
                )
                putActResult(repair.id, { kind: 'done', result })
              } catch (e) {
                putActResult(repair.id, {
                  kind: 'error',
                  message: e instanceof Error ? e.message : 'Не удалось обработать акт',
                })
              }
            }
          }}
        />
      )}
    </div>
  )
}
