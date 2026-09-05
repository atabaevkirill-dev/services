import { useState } from 'react'
import { Button, Field, Icon, Modal, Segmented, Switch } from '../ui'
import { useRepairs } from '../repairs/store'
import { ACCENTS, FONTS, isValidHex, type Density, type FontKey, type ThemeMode } from '../theme/themes'
import type { StampPosition } from './store'
import { useSettings } from './store'
import type { DateFormat } from '../lib/date'
import { StatusBadge } from '../repairs/StatusBadge'

function Row({ name, hint, children }: { name: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <div className="row__label">
        <div className="row__name">{name}</div>
        {hint && <div className="row__hint">{hint}</div>}
      </div>
      <div className="row__control">{children}</div>
    </div>
  )
}

export function SettingsPanel() {
  const s = useSettings()
  const { items, clearAll, seedDemo } = useRepairs()
  const [confirm, setConfirm] = useState<'clear' | 'seed' | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: 'clear' | 'seed') => {
    setBusy(true)
    await (action === 'clear' ? clearAll() : seedDemo())
    setBusy(false)
    setConfirm(null)
  }

  return (
    <div className="settings">
      <section className="card">
        <h3 className="card__title">
          <Icon name="droplet" size={15} /> Тема и гамма
        </h3>

        <Row name="Тема" hint="«Как в системе» переключается вместе с оформлением ОС">
          <Segmented<ThemeMode>
            value={s.themeMode}
            onChange={(v) => s.set('themeMode', v)}
            options={[
              { value: 'dark', label: 'Тёмная' },
              { value: 'light', label: 'Светлая' },
              { value: 'auto', label: 'Как в системе' },
            ]}
          />
        </Row>

        <Row name="Акцентный цвет" hint="Задаёт подсветку выбранной строки, кнопки и активные фильтры">
          <div className="swatches">
            {ACCENTS.map((a) => (
              <button
                key={a.key}
                className="swatch"
                title={a.label}
                aria-label={a.label}
                data-on={s.accent.toLowerCase() === a.hex}
                style={{ background: a.hex }}
                onClick={() => s.set('accent', a.hex)}
              />
            ))}
            <input
              className="input"
              style={{ width: 104, fontFamily: 'var(--font-mono)' }}
              value={s.accent}
              spellCheck={false}
              onChange={(e) => {
                const v = e.target.value
                if (isValidHex(v)) s.set('accent', v.startsWith('#') ? v : `#${v}`)
                else s.set('accent', v)
              }}
            />
          </div>
        </Row>
      </section>

      <section className="card">
        <h3 className="card__title">
          <Icon name="type" size={15} /> Шрифт и плотность
        </h3>

        <Row name="Шрифт интерфейса">
          <select className="select" style={{ width: 190 }} value={s.fontKey} onChange={(e) => s.set('fontKey', e.target.value as FontKey)}>
            {FONTS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </Row>

        <Row name="Размер текста" hint={`${s.fontSize} px — масштабирует весь интерфейс`}>
          <input
            className="range"
            style={{ width: 170 }}
            type="range"
            min={12}
            max={18}
            step={1}
            value={s.fontSize}
            onChange={(e) => s.set('fontSize', Number(e.target.value))}
          />
        </Row>

        <Row name="Плотность списка">
          <Segmented<Density>
            value={s.density}
            onChange={(v) => s.set('density', v)}
            options={[
              { value: 'compact', label: 'Компактно' },
              { value: 'comfortable', label: 'Просторно' },
            ]}
          />
        </Row>

        <Row name="Скругление углов" hint={`${s.radius} px`}>
          <input
            className="range"
            style={{ width: 170 }}
            type="range"
            min={2}
            max={18}
            step={1}
            value={s.radius}
            onChange={(e) => s.set('radius', Number(e.target.value))}
          />
        </Row>
      </section>

      <section className="card">
        <h3 className="card__title">
          <Icon name="list" size={15} /> Список заявок
        </h3>

        <Row name="Колонка «Примечания»">
          <Switch checked={s.showNotes} onChange={(v) => s.set('showNotes', v)} label="Показывать примечания" />
        </Row>
        <Row name="Серийный номер в строке">
          <Switch checked={s.showSerial} onChange={(v) => s.set('showSerial', v)} label="Показывать серийный номер" />
        </Row>
        <Row name="Миниатюры фото" hint="Первое фото заявки показывается в списке">
          <Switch checked={s.showThumbs} onChange={(v) => s.set('showThumbs', v)} label="Показывать миниатюры" />
        </Row>
        <Row name="Формат даты">
          <select className="select" style={{ width: 150 }} value={s.dateFormat} onChange={(e) => s.set('dateFormat', e.target.value as DateFormat)}>
            <option value="dd.mm">04.09</option>
            <option value="dd.mm.yyyy">04.09.2026</option>
            <option value="iso">2026-09-04</option>
          </select>
        </Row>
        <Row name="Порог «долго в ремонте»" hint={`Заявки старше ${s.longRepairDays} дней подсвечиваются`}>
          <input
            className="input"
            style={{ width: 78 }}
            type="number"
            min={1}
            max={365}
            value={s.longRepairDays}
            onChange={(e) => s.set('longRepairDays', Math.max(1, Number(e.target.value) || 1))}
          />
        </Row>
      </section>

      <section className="card">
        <h3 className="card__title">
          <Icon name="video" size={15} /> Штамп на фото и видео
        </h3>

        <Row name="Накладывать штамп" hint="Показывается поверх при просмотре, сам файл не изменяется">
          <Switch checked={s.stampEnabled} onChange={(v) => s.set('stampEnabled', v)} label="Накладывать штамп" />
        </Row>
        <Row name="Что показывать">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(
              [
                ['stampDate', 'Дата'],
                ['stampTime', 'Время'],
                ['stampEquipment', 'Оборудование'],
                ['stampNumber', '№ заявки'],
                ['stampLocation', 'Локация'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className="chip"
                data-on={s[key]}
                disabled={!s.stampEnabled}
                style={!s.stampEnabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                onClick={() => s.set(key, !s[key])}
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
        <Row name="Положение">
          <Segmented<StampPosition>
            value={s.stampPosition}
            onChange={(v) => s.set('stampPosition', v)}
            options={[
              { value: 'tl', label: 'Сверху слева' },
              { value: 'tr', label: 'Сверху справа' },
              { value: 'bl', label: 'Снизу слева' },
              { value: 'br', label: 'Снизу справа' },
            ]}
          />
        </Row>
      </section>

      <section className="card">
        <h3 className="card__title">
          <Icon name="layout" size={15} /> Окно виджета
        </h3>

        <Row name="Поверх других окон" hint="Работает в десктопной сборке">
          <Switch checked={s.alwaysOnTop} onChange={(v) => s.set('alwaysOnTop', v)} label="Поверх других окон" />
        </Row>
        <Row name="Непрозрачность" hint={`${s.widgetOpacity}%`}>
          <input
            className="range"
            style={{ width: 170 }}
            type="range"
            min={50}
            max={100}
            step={5}
            value={s.widgetOpacity}
            onChange={(e) => s.set('widgetOpacity', Number(e.target.value))}
          />
        </Row>
      </section>

      <section className="card">
        <h3 className="card__title">
          <Icon name="package" size={15} /> Данные
        </h3>

        <Row name="Демонстрационный набор" hint="Заменит содержимое базы 14 примерными заявками">
          <Button icon="refresh" disabled={busy} onClick={() => setConfirm('seed')}>
            Загрузить демо-данные
          </Button>
        </Row>
        <Row name="Очистка базы" hint={`Сейчас в базе ${items.length} ${items.length === 1 ? 'заявка' : 'заявок'} — удалятся вместе с историей и файлами`}>
          <Button variant="danger" icon="trash" disabled={busy || items.length === 0} onClick={() => setConfirm('clear')}>
            Удалить все заявки
          </Button>
        </Row>
      </section>

      <section className="card">
        <h3 className="card__title">
          <Icon name="monitor" size={15} /> Предпросмотр
        </h3>
        <div className="preview">
          <div className="preview__bar">
            <Icon name="wrench" size={13} /> Сервис · ремонт оборудования
          </div>
          <div className="preview__body">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <StatusBadge status="in_progress" />
              <StatusBadge status="waiting_parts" />
              <StatusBadge status="done" />
              <StatusBadge status="rejected" />
            </div>
            <Field label="Пример поля">
              <input className="input" defaultValue="Ноутбук Dell Latitude 5540" />
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" icon="plus">
                Заявка
              </Button>
              <Button icon="refresh">Обновить</Button>
              <Button variant="ghost" icon="settings">
                Настройки
              </Button>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <Button icon="refresh" onClick={s.reset}>
            Сбросить оформление
          </Button>
        </div>
      </section>

      {confirm === 'clear' && (
        <Modal
          title="Удалить все заявки?"
          width={440}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>Отмена</Button>
              <Button variant="danger" icon="trash" disabled={busy} onClick={() => void run('clear')}>
                Удалить {items.length}
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
            Будут удалены все {items.length} заявок вместе с историей статусов и прикреплёнными файлами. Отменить это
            действие нельзя.
          </p>
        </Modal>
      )}

      {confirm === 'seed' && (
        <Modal
          title="Загрузить демо-данные?"
          width={440}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button onClick={() => setConfirm(null)}>Отмена</Button>
              <Button variant="primary" icon="refresh" disabled={busy} onClick={() => void run('seed')}>
                Загрузить
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 1.6 }}>
            Текущее содержимое базы будет заменено демонстрационным набором из 14 заявок.
          </p>
        </Modal>
      )}
    </div>
  )
}
