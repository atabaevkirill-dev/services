import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button, Icon, Segmented, Switch } from '../ui'
import type { ExportBundle } from '../repairs/repo'
import { KIND_LABEL, STATUSES, STATUS_META, formatSize, type Repair, type RepairStatus } from '../repairs/types'
import { daysLabel, daysSince, formatDate, formatDateTime } from '../lib/date'
import './report.css'

/** Цвета статусов для печати — не зависят от темы приложения. */
const PRINT_COLOR: Record<RepairStatus, string> = {
  accepted: '#64748b',
  diagnostics: '#0284c7',
  waiting_parts: '#b45309',
  in_progress: '#7c3aed',
  done: '#047857',
  issued: '#0d9488',
  rejected: '#be123c',
}

type Orientation = 'landscape' | 'portrait'
type Block = { kind: 'cover' } | { kind: 'row'; repair: Repair } | { kind: 'card'; repair: Repair }

function Badge({ status }: { status: RepairStatus }) {
  return (
    <span className="rep__badge" style={{ ['--c' as string]: PRINT_COLOR[status] }}>
      <span className="rep__dot" />
      {STATUS_META[status].label}
    </span>
  )
}

function TableHead() {
  return (
    <thead>
      <tr>
        <th style={{ width: '4%' }}>№</th>
        <th style={{ width: '9%' }}>Принято</th>
        <th style={{ width: '22%' }}>Оборудование</th>
        <th style={{ width: '15%' }}>От кого · локация</th>
        <th style={{ width: '18%' }}>Неисправность</th>
        <th style={{ width: '11%' }}>Статус</th>
        <th style={{ width: '21%' }}>Примечания</th>
      </tr>
    </thead>
  )
}

function Row({ repair, longRepairDays }: { repair: Repair; longRepairDays: number }) {
  const age = daysSince(repair.receivedAt)
  const long = STATUS_META[repair.status].active && age >= longRepairDays
  return (
    <>
      <td className="rep__num">{repair.number}</td>
      <td>
        <div className="rep__date">{formatDate(repair.receivedAt, 'dd.mm.yyyy')}</div>
        <div className="rep__days" data-long={long}>
          {daysLabel(age)}
        </div>
      </td>
      <td>
        <div className="rep__main">{repair.equipment}</div>
        {repair.serialNo && <div className="rep__note">с/н {repair.serialNo}</div>}
      </td>
      <td>
        <div>{repair.fromWhom ?? '—'}</div>
        <div className="rep__note">{[repair.location, repair.contact].filter(Boolean).join(' · ') || '—'}</div>
      </td>
      <td>{repair.problem ?? '—'}</td>
      <td>
        <Badge status={repair.status} />
        {repair.issuedAt && <div className="rep__note">выдано {formatDate(repair.issuedAt, 'dd.mm.yyyy')}</div>}
      </td>
      <td>{repair.notes ?? '—'}</td>
    </>
  )
}

export function Report({
  bundle,
  scope,
  longRepairDays,
  onExcel,
  onClose,
}: {
  bundle: ExportBundle
  scope: string
  longRepairDays: number
  onExcel: () => void
  onClose: () => void
}) {
  const [orientation, setOrientation] = useState<Orientation>('landscape')
  const [detailed, setDetailed] = useState(true)
  const [pages, setPages] = useState<Block[][]>([])

  const measureRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)

  const { repairs, events, files } = bundle
  const generatedAt = useMemo(() => new Date().toISOString(), [])

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `@page { size: A4 ${orientation}; margin: 0; }`
    document.head.appendChild(style)
    return () => style.remove()
  }, [orientation])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const counts = useMemo(() => {
    const map = {} as Record<RepairStatus, number>
    for (const s of STATUSES) map[s] = 0
    for (const r of repairs) map[r.status] += 1
    return map
  }, [repairs])

  const eventsBy = useMemo(() => {
    const map = new Map<number, typeof events>()
    for (const e of events) map.set(e.repairId, [...(map.get(e.repairId) ?? []), e])
    for (const list of map.values()) list.sort((a, b) => a.at.localeCompare(b.at))
    return map
  }, [events])

  const filesBy = useMemo(() => {
    const map = new Map<number, typeof files>()
    for (const f of files) map.set(f.repairId, [...(map.get(f.repairId) ?? []), f])
    return map
  }, [files])

  /** Разбивает содержимое на страницы по фактическим высотам блоков. */
  useLayoutEffect(() => {
    const measure = measureRef.current
    const probe = probeRef.current
    if (!measure || !probe) return

    const available = probe.clientHeight - 2 // запас против округления высот
    const cover = measure.querySelector<HTMLElement>('[data-block="cover"]')
    const thead = measure.querySelector<HTMLElement>('thead')
    const coverH = cover?.getBoundingClientRect().height ?? 0
    const theadH = thead?.getBoundingClientRect().height ?? 0

    const rowH = new Map<number, number>()
    measure.querySelectorAll<HTMLElement>('tbody tr[data-id]').forEach((tr) => {
      rowH.set(Number(tr.dataset.id), tr.getBoundingClientRect().height)
    })
    const cardH = new Map<number, number>()
    measure.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
      cardH.set(Number(el.dataset.card), el.getBoundingClientRect().height)
    })

    const blocks: Block[] = [
      { kind: 'cover' },
      ...repairs.map((repair): Block => ({ kind: 'row', repair })),
      ...(detailed ? repairs.map((repair): Block => ({ kind: 'card', repair })) : []),
    ]

    const result: Block[][] = []
    let current: Block[] = []
    let used = 0
    let tableOpen = false

    const push = () => {
      if (current.length) result.push(current)
      current = []
      used = 0
      tableOpen = false
    }

    for (const block of blocks) {
      const own =
        block.kind === 'cover' ? coverH : block.kind === 'row' ? (rowH.get(block.repair.id) ?? 26) : (cardH.get(block.repair.id) ?? 120)
      const extra = block.kind === 'row' && !tableOpen ? theadH : 0

      if (current.length && used + own + extra > available) push()
      current.push(block)
      used += own + (block.kind === 'row' && !tableOpen ? theadH : 0)
      if (block.kind === 'row') tableOpen = true
      else tableOpen = false
    }
    push()

    setPages(result.length ? result : [[{ kind: 'cover' }]])
  }, [repairs, detailed, orientation, longRepairDays, eventsBy, filesBy])

  const coverNode = (
    <div className="rep__cover">
      <div className="rep__head">
        <span className="rep__logo">
          <Icon name="wrench" size={15} />
        </span>
        <div>
          <h1 className="rep__title">Заявки в ремонте</h1>
          <p className="rep__sub">{scope}</p>
        </div>
        <div className="rep__meta">
          Сформировано {formatDateTime(generatedAt)}
          <br />
          Всего заявок: {repairs.length}
        </div>
      </div>
      <div className="rep__summary">
        {STATUSES.filter((s) => counts[s] > 0).map((s) => (
          <span className="rep__sum" key={s}>
            <span style={{ color: PRINT_COLOR[s] }}>{STATUS_META[s].label}</span>
            <b>{counts[s]}</b>
          </span>
        ))}
      </div>
    </div>
  )

  const cardNode = (repair: Repair) => {
    const history = eventsBy.get(repair.id) ?? []
    const attached = filesBy.get(repair.id) ?? []
    return (
      <div className="rep__card">
        <div className="rep__cardHead">
          <span className="rep__num">№ {repair.number}</span>
          <h2 className="rep__cardTitle">{repair.equipment}</h2>
          <span style={{ marginLeft: 'auto' }}>
            <Badge status={repair.status} />
          </span>
        </div>

        <div className="rep__grid">
          <div className="rep__row">
            <span className="rep__key">Поступило</span>
            <span>
              {formatDate(repair.receivedAt, 'dd.mm.yyyy')} · {daysLabel(daysSince(repair.receivedAt))} в ремонте
            </span>
          </div>
          <div className="rep__row">
            <span className="rep__key">Серийный / инв. №</span>
            <span>{repair.serialNo ?? '—'}</span>
          </div>
          <div className="rep__row">
            <span className="rep__key">От кого</span>
            <span>{repair.fromWhom ?? '—'}</span>
          </div>
          <div className="rep__row">
            <span className="rep__key">Контакт</span>
            <span>{repair.contact ?? '—'}</span>
          </div>
          <div className="rep__row">
            <span className="rep__key">Локация</span>
            <span>{repair.location ?? '—'}</span>
          </div>
          <div className="rep__row">
            <span className="rep__key">Выдано</span>
            <span>{repair.issuedAt ? formatDate(repair.issuedAt, 'dd.mm.yyyy') : '—'}</span>
          </div>
          <div className="rep__row" style={{ gridColumn: '1 / -1' }}>
            <span className="rep__key">Неисправность</span>
            <span>{repair.problem ?? '—'}</span>
          </div>
          <div className="rep__row" style={{ gridColumn: '1 / -1' }}>
            <span className="rep__key">Примечания</span>
            <span>{repair.notes ?? '—'}</span>
          </div>
        </div>

        <div className="rep__sec">История статусов</div>
        <div className="rep__tl">
          {history.length === 0 && <div className="rep__note">событий нет</div>}
          {history.map((e) => (
            <div className="rep__tlRow" key={e.id}>
              <span className="rep__tlDate">{formatDateTime(e.at)}</span>
              <span>
                {e.fromStatus ? `${STATUS_META[e.fromStatus].label} → ` : ''}
                <b style={{ fontWeight: 500, color: PRINT_COLOR[e.toStatus] }}>{STATUS_META[e.toStatus].label}</b>
                {e.comment ? ` — ${e.comment}` : ''}
              </span>
            </div>
          ))}
        </div>

        {attached.length > 0 && (
          <>
            <div className="rep__sec">Файлы</div>
            <div className="rep__files">
              {attached.map((f) => (
                <span className="rep__file" key={f.id}>
                  {f.fileName} · {KIND_LABEL[f.kind]} · {formatSize(f.size)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  /** Подряд идущие строки собираются в одну таблицу со своей шапкой. */
  const renderBlocks = (blocks: Block[]) => {
    const out: React.ReactNode[] = []
    let rows: Repair[] = []
    const flush = (key: string) => {
      if (!rows.length) return
      const list = rows
      rows = []
      out.push(
        <table className="rep__table" key={key}>
          <TableHead />
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <Row repair={r} longRepairDays={longRepairDays} />
              </tr>
            ))}
          </tbody>
        </table>,
      )
    }

    blocks.forEach((b, i) => {
      if (b.kind === 'row') {
        rows.push(b.repair)
        return
      }
      flush(`t-${i}`)
      out.push(b.kind === 'cover' ? <div key="cover">{coverNode}</div> : <div key={`c-${b.repair.id}`}>{cardNode(b.repair)}</div>)
    })
    flush('t-last')
    return out
  }

  const pageHead = (
    <div className="rep__pageHead">
      <span className="rep__pageLogo">
        <Icon name="wrench" size={11} />
      </span>
      <span className="rep__pageName">Заявки в ремонте</span>
      <span className="rep__pageScope">{scope}</span>
      <span className="rep__pageDate">{formatDate(generatedAt, 'dd.mm.yyyy')}</span>
    </div>
  )

  return (
    <div className="reportWrap">
      <div className="report__chrome">
        <span className="report__chromeTitle">Предпросмотр отчёта</span>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>
          {repairs.length} {repairs.length === 1 ? 'заявка' : 'заявок'} · {pages.length}{' '}
          {pages.length === 1 ? 'страница' : 'страниц'} · {scope}
        </span>
        <span style={{ flex: 1 }} />

        <Segmented<Orientation>
          value={orientation}
          onChange={setOrientation}
          options={[
            { value: 'landscape', label: 'Альбомная' },
            { value: 'portrait', label: 'Книжная' },
          ]}
        />
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-xs)', color: 'var(--text-2)' }}>
          Подробные карточки
          <Switch checked={detailed} onChange={setDetailed} label="Подробные карточки" />
        </span>
        <Button icon="download" onClick={onExcel}>
          Excel
        </Button>
        <Button variant="primary" icon="download" onClick={() => window.print()}>
          Сохранить PDF
        </Button>
        <Button variant="ghost" icon="x" onClick={onClose} aria-label="Закрыть предпросмотр" />
      </div>

      <div className="report__scroll" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className="report__doc">
          {pages.map((blocks, i) => (
            <div className="rep__page" data-page={orientation} key={i}>
              {pageHead}
              <div className="rep__pageBody">{renderBlocks(blocks)}</div>
              <div className="rep__pageFoot">
                <span>Сервис · учёт ремонта оборудования</span>
                <span>
                  Страница {i + 1} из {pages.length}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Скрытые эталоны: пустая страница задаёт доступную высоту, измеритель — высоты блоков */}
        <div className="rep__probe" aria-hidden="true">
          <div className="rep__page" data-page={orientation}>
            {pageHead}
            <div className="rep__pageBody" ref={probeRef} />
            <div className="rep__pageFoot">
              <span>Сервис · учёт ремонта оборудования</span>
              <span>Страница 1 из 1</span>
            </div>
          </div>
        </div>

        <div className="rep__measure" data-page={orientation} ref={measureRef} aria-hidden="true">
          <div data-block="cover">{coverNode}</div>
          <table className="rep__table">
            <TableHead />
            <tbody>
              {repairs.map((r) => (
                <tr key={r.id} data-id={r.id}>
                  <Row repair={r} longRepairDays={longRepairDays} />
                </tr>
              ))}
            </tbody>
          </table>
          {detailed &&
            repairs.map((r) => (
              <div key={r.id} data-card={r.id}>
                {cardNode(r)}
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
