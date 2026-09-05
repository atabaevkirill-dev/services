import { useState } from 'react'
import { Button, DropZone, Field, Icon, Modal } from '../ui'
import { Attachments } from './Attachments'
import { KIND_COLOR, KIND_LABEL, formatSize, kindOf } from './types'
import { fromDateInput, toDateInput } from '../lib/date'
import { STATUSES, STATUS_META, emptyDraft, type Repair, type RepairDraft, type RepairStatus } from './types'

interface Props {
  initial?: Repair
  onClose: () => void
  /** Для новой заявки вторым аргументом приходят файлы, выбранные до сохранения. */
  onSubmit: (draft: RepairDraft, files: File[]) => Promise<void>
}

export function RepairForm({ initial, onClose, onSubmit }: Props) {
  const [draft, setDraft] = useState<RepairDraft>(() =>
    initial
      ? {
          number: initial.number,
          receivedAt: initial.receivedAt,
          equipment: initial.equipment,
          serialNo: initial.serialNo,
          fromWhom: initial.fromWhom,
          contact: initial.contact,
          location: initial.location,
          problem: initial.problem,
          status: initial.status,
          notes: initial.notes,
          issuedAt: initial.issuedAt,
        }
      : emptyDraft(),
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<File[]>([])

  const patch = <K extends keyof RepairDraft>(key: K, value: RepairDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const submit = async () => {
    if (!draft.equipment.trim()) {
      setError('Укажите наименование оборудования')
      return
    }
    setBusy(true)
    try {
      await onSubmit({ ...draft, equipment: draft.equipment.trim(), number: draft.number.trim() }, pending)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить заявку')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={initial ? `Заявка № ${initial.number}` : 'Новая заявка'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="primary" icon="check" onClick={submit} disabled={busy}>
            {initial ? 'Сохранить' : 'Создать'}
          </Button>
        </>
      }
    >
      <div className="form">
        <Field label="Оборудование" error={error && !draft.equipment.trim() ? error : undefined}>
          <input
            className="input"
            autoFocus
            placeholder="Ноутбук Dell Latitude 5540"
            value={draft.equipment}
            onChange={(e) => {
              patch('equipment', e.target.value)
              setError('')
            }}
          />
        </Field>

        <div className="form__row form__row--3">
          <Field label="Номер заявки" error={/номер/i.test(error) ? error : undefined}>
            <input
              className="input"
              placeholder={initial ? initial.number : 'авто'}
              value={draft.number}
              onChange={(e) => {
                patch('number', e.target.value)
                setError('')
              }}
            />
          </Field>
          <Field label="Серийный / инв. номер">
            <input className="input" placeholder="CN0X7T92" value={draft.serialNo ?? ''} onChange={(e) => patch('serialNo', e.target.value)} />
          </Field>
          <Field label="Дата поступления">
            <input
              className="input"
              type="date"
              value={toDateInput(draft.receivedAt)}
              onChange={(e) => patch('receivedAt', fromDateInput(e.target.value) ?? draft.receivedAt)}
            />
          </Field>
        </div>

        <div className="form__row">
          <Field label="От кого">
            <input className="input" placeholder="Иванов А. В. / Бухгалтерия" value={draft.fromWhom ?? ''} onChange={(e) => patch('fromWhom', e.target.value)} />
          </Field>
          <Field label="Контакт">
            <input className="input" placeholder="+7 912 445-11-08 / доб. 214" value={draft.contact ?? ''} onChange={(e) => patch('contact', e.target.value)} />
          </Field>
        </div>

        <div className="form__row">
          <Field label="Локация">
            <input className="input" placeholder="Цех №2, участок сборки" value={draft.location ?? ''} onChange={(e) => patch('location', e.target.value)} />
          </Field>
          <Field label="Статус">
            <select className="select" value={draft.status} onChange={(e) => patch('status', e.target.value as RepairStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Неисправность">
          <textarea className="textarea" placeholder="Не включается после залития жидкостью" value={draft.problem ?? ''} onChange={(e) => patch('problem', e.target.value)} />
        </Field>

        <Field label="Примечания">
          <textarea className="textarea" placeholder="Что сделано, что заказано, договорённости" value={draft.notes ?? ''} onChange={(e) => patch('notes', e.target.value)} />
        </Field>

        <div className="formFiles">
          <h3 className="section__title" style={{ marginBottom: 8 }}>
            <Icon name="paperclip" size={13} /> Файлы
          </h3>
          {initial ? (
            <Attachments repairId={initial.id} />
          ) : (
            <>
              {pending.length > 0 && (
                <div className="docs" style={{ marginTop: 0, marginBottom: 8 }}>
                  {pending.map((f, i) => (
                    <div className="doc" key={`${f.name}-${i}`}>
                      <span className="doc__icon" style={{ ['--doc-color' as string]: KIND_COLOR[kindOf(f.name, f.type)] }}>
                        <Icon name="file" size={15} />
                      </span>
                      <span className="doc__body">
                        <span className="doc__name">{f.name}</span>
                        <span className="doc__meta">
                          {KIND_LABEL[kindOf(f.name, f.type)]} · {formatSize(f.size)}
                        </span>
                      </span>
                      <span />
                      <button
                        className="doc__act"
                        onClick={() => setPending((list) => list.filter((_, k) => k !== i))}
                        title="Убрать файл"
                        aria-label="Убрать файл"
                      >
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <DropZone
                onFiles={(files) => setPending((list) => [...list, ...files])}
                hint="или нажмите, чтобы выбрать — прикрепятся при создании заявки"
              />
            </>
          )}
        </div>

        {error && draft.equipment.trim() && !/номер/i.test(error) && <span className="field__error">{error}</span>}
      </div>
    </Modal>
  )
}
