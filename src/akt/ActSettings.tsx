import { useState } from 'react'
import { Button, Icon, Segmented, Switch } from '../ui'
import { useSettings } from '../settings/store'
import { checkProvider, ollamaModels } from './vision'
import type { VisionProvider } from './types'

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

/** Настройки распознавания входных актов и папки, куда складываются результаты. */
export function ActSettings() {
  const s = useSettings()
  const [check, setCheck] = useState<{ ok: boolean; note: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [models, setModels] = useState<string[] | null>(null)

  const settings = {
    provider: s.visionProvider,
    ollamaUrl: s.ollamaUrl,
    ollamaModel: s.ollamaModel,
    openaiBaseUrl: s.openaiBaseUrl,
    openaiKey: s.openaiKey,
    openaiModel: s.openaiModel,
  }

  const runCheck = async () => {
    setBusy(true)
    setCheck(null)
    try {
      setModels(s.visionProvider === 'ollama' ? await ollamaModels(s.ollamaUrl) : null)
      setCheck(await checkProvider(settings))
    } finally {
      setBusy(false)
    }
  }

  const pickFolder = async () => {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({ directory: true, multiple: false, title: 'Куда складывать папки актов' })
    if (typeof picked === 'string') s.set('aktSavePath', picked)
  }

  return (
    <section className="card">
      <h3 className="card__title">
        <Icon name="scan" size={15} /> Распознавание входных актов
      </h3>

      <Row name="Распознавать сразу" hint="Как только файл помечен входным актом">
        <Switch
          checked={s.aktAutoRecognize}
          onChange={(v) => s.set('aktAutoRecognize', v)}
          label="Распознавать сразу"
        />
      </Row>

      <Row name="Заводить заявки на остальные приборы" hint="В акте их бывает несколько, заявка — на одно оборудование">
        <Switch
          checked={s.aktCreateRepairs}
          onChange={(v) => s.set('aktCreateRepairs', v)}
          label="Заводить заявки на остальные приборы"
        />
      </Row>

      <Row name="Номер заявки из номера акта" hint="Акт №46 → заявка №46; занятый номер останется прежним">
        <Switch
          checked={s.aktNumberFromAct}
          onChange={(v) => s.set('aktNumberFromAct', v)}
          label="Номер заявки из номера акта"
        />
      </Row>

      <Row name="Папка для актов" hint={s.aktSavePath || 'Не выбрана — документы попадут только во вложения заявки'}>
        <span style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" icon="folder" onClick={() => void pickFolder()}>
            Выбрать
          </Button>
          {s.aktSavePath && (
            <Button size="sm" variant="ghost" icon="x" onClick={() => s.set('aktSavePath', '')} aria-label="Очистить путь" />
          )}
        </span>
      </Row>

      <Row name="Где распознавать" hint="Локальная модель не отправляет сканы наружу">
        <Segmented<VisionProvider>
          value={s.visionProvider}
          onChange={(v) => s.set('visionProvider', v)}
          options={[
            { value: 'ollama', label: 'Ollama' },
            { value: 'openai', label: 'Свой сервер' },
          ]}
        />
      </Row>

      {s.visionProvider === 'ollama' ? (
        <>
          <Row name="Адрес Ollama">
            <input
              className="input"
              style={{ width: 230 }}
              value={s.ollamaUrl}
              onChange={(e) => s.set('ollamaUrl', e.target.value)}
              placeholder="http://localhost:11434"
            />
          </Row>
          <Row name="Модель" hint={models?.length ? `Установлены: ${models.join(', ')}` : 'Нужна модель с распознаванием изображений'}>
            <input
              className="input"
              style={{ width: 230 }}
              value={s.ollamaModel}
              onChange={(e) => s.set('ollamaModel', e.target.value)}
              placeholder="qwen2.5vl:7b"
            />
          </Row>
        </>
      ) : (
        <>
          <Row name="Адрес сервера" hint="OpenAI-совместимый: LM Studio, vLLM, облачный API">
            <input
              className="input"
              style={{ width: 230 }}
              value={s.openaiBaseUrl}
              onChange={(e) => s.set('openaiBaseUrl', e.target.value)}
              placeholder="http://localhost:1234/v1"
            />
          </Row>
          <Row name="Модель">
            <input
              className="input"
              style={{ width: 230 }}
              value={s.openaiModel}
              onChange={(e) => s.set('openaiModel', e.target.value)}
              placeholder="qwen2.5-vl"
            />
          </Row>
          <Row name="Ключ доступа" hint="Пусто, если сервер локальный">
            <input
              className="input"
              style={{ width: 230 }}
              type="password"
              value={s.openaiKey}
              onChange={(e) => s.set('openaiKey', e.target.value)}
            />
          </Row>
        </>
      )}

      <Row name="Проверка связи" hint={check ? check.note : 'Ответит ли модель и на месте ли она'}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {check && (
            <Icon name={check.ok ? 'check' : 'alert'} size={15} className={check.ok ? 'akt__ok' : 'akt__bad'} />
          )}
          <Button size="sm" icon="refresh" disabled={busy} onClick={() => void runCheck()}>
            {busy ? 'Проверяю…' : 'Проверить'}
          </Button>
        </span>
      </Row>
    </section>
  )
}
