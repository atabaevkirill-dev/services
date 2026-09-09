import { useState } from 'react'
import { Button, EmptyState, Icon } from '../ui'
import { useSettings } from '../settings/store'
import { useRepairs } from './store'
import { RepairForm } from './RepairForm'
import { CoverMedia, FileManager } from './FileManager'
import { STATUSES, STATUS_META, type Repair, type RepairStatus } from './types'
import { daysLabel, daysSince, formatDate, formatDateTime } from '../lib/date'

function Prop({ icon, label, value }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; value: string | null }) {
  return (
    <div className="prop">
      <span className="prop__key">
        <Icon name={icon} size={14} />
        {label}
      </span>
      <span className={value ? 'prop__val' : 'prop__val prop__val--muted'}>{value || '—'}</span>
    </div>
  )
}

export function RepairDetails({ repair }: { repair: Repair }) {
  const { select, setStatus, update, remove, history } = useRepairs()
  const { longRepairDays } = useSettings()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const age = daysSince(repair.receivedAt)
  const isLong = STATUS_META[repair.status].active && age >= longRepairDays

  return (
    <aside className="drawer">
      <div className="drawer__head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="drawer__num">№ {repair.number}</span>
          <h2 className="drawer__title">{repair.equipment}</h2>
        </div>
        <Button variant="ghost" icon="x" onClick={() => select(null)} aria-label="Закрыть карточку" />
      </div>

      <div className="drawer__body">
        <CoverMedia repairId={repair.id} />

        <div className="section">
          <h3 className="section__title">
            <Icon name="wrench" size={13} /> Статус
          </h3>
          <div className="statusPick">
            {STATUSES.map((s) => (
              <button
                key={s}
                className="chip"
                data-on={s === repair.status}
                style={
                  s === repair.status
                    ? {
                        color: STATUS_META[s].color,
                        borderColor: STATUS_META[s].color,
                        background: `color-mix(in srgb, ${STATUS_META[s].color} var(--tint), transparent)`,
                      }
                    : undefined
                }
                onClick={() => setStatus(repair.id, s)}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-xs)', color: isLong ? 'var(--warn)' : 'var(--text-3)' }}>
            В ремонте {daysLabel(age)}
            {isLong ? ` · дольше порога в ${longRepairDays}` : ''}
          </p>
        </div>

        <div className="section">
          <h3 className="section__title">
            <Icon name="package" size={13} /> Карточка
          </h3>
          <div className="props">
            <Prop icon="calendar" label="Поступило" value={formatDate(repair.receivedAt, 'dd.mm.yyyy')} />
            <Prop icon="type" label="Серийный №" value={repair.serialNo} />
            <Prop icon="user" label="От кого" value={repair.fromWhom} />
            <Prop icon="phone" label="Контакт" value={repair.contact} />
            <Prop icon="mapPin" label="Локация" value={repair.location} />
            <Prop icon="alert" label="Неисправность" value={repair.problem} />
            {repair.issuedAt && <Prop icon="check" label="Выдано" value={formatDate(repair.issuedAt, 'dd.mm.yyyy')} />}
          </div>
        </div>

        <div className="section">
          <h3 className="section__title">
            <Icon name="edit" size={13} /> Примечания
          </h3>
          <textarea
            className="textarea"
            placeholder="Что сделано, что заказано, договорённости"
            defaultValue={repair.notes ?? ''}
            key={repair.id}
            onBlur={(e) => {
              if (e.target.value !== (repair.notes ?? '')) update(repair.id, { notes: e.target.value })
            }}
          />
          <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>
            Сохраняется автоматически · обновлено {formatDateTime(repair.updatedAt)}
          </p>
        </div>

        <FileManager repairId={repair.id} />

        <div className="section">
          <h3 className="section__title">
            <Icon name="history" size={13} /> История статусов
          </h3>
          {history.length === 0 ? (
            <EmptyState icon="clock" title="Событий пока нет" />
          ) : (
            <div className="timeline">
              {history.map((e, i) => (
                <div className="tl" key={e.id}>
                  <div className="tl__rail">
                    <span className="tl__dot" style={{ ['--tl-color' as string]: STATUS_META[e.toStatus as RepairStatus].color }} />
                    {i < history.length - 1 && <span className="tl__line" />}
                  </div>
                  <div className="tl__body">
                    <div className="tl__title">
                      {e.fromStatus ? `${STATUS_META[e.fromStatus].label} → ` : ''}
                      <strong style={{ fontWeight: 500 }}>{STATUS_META[e.toStatus].label}</strong>
                    </div>
                    <div className="tl__meta">{formatDateTime(e.at)}</div>
                    {e.comment && <div className="tl__comment">{e.comment}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="drawer__foot">
        <Button icon="edit" onClick={() => setEditing(true)}>
          Редактировать
        </Button>
        <div style={{ flex: 1 }} />
        {confirmDelete ? (
          <>
            <Button size="sm" onClick={() => setConfirmDelete(false)}>
              Отмена
            </Button>
            <Button size="sm" variant="danger" icon="trash" onClick={() => remove(repair.id)}>
              Удалить насовсем
            </Button>
          </>
        ) : (
          <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)} aria-label="Удалить заявку" />
        )}
      </div>

      {editing && (
        <RepairForm
          initial={repair}
          onClose={() => setEditing(false)}
          onSubmit={async (draft) => {
            await update(repair.id, draft)
            if (draft.status !== repair.status) await setStatus(repair.id, draft.status)
          }}
        />
      )}

    </aside>
  )
}
