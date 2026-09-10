import { Icon } from '../ui'
import type { ActRunResult } from './pipeline'

export type ActState =
  | { kind: 'running'; stage: string; fileName: string }
  | { kind: 'done'; result: ActRunResult }
  | { kind: 'error'; message: string }

/** Ход распознавания акта и его итог — прямо в карточке, рядом с файлами. */
export function ActPanel({
  state,
  onClose,
  onOpenFolder,
}: {
  state: ActState
  onClose: () => void
  onOpenFolder: (folder: string) => void
}) {
  if (state.kind === 'running') {
    return (
      <div className="akt akt--work">
        <span className="akt__spin" aria-hidden="true" />
        <span className="akt__body">
          <span className="akt__title">{state.stage}…</span>
          <span className="akt__note">
            {state.fileName} · распознавание рукописного акта занимает до нескольких минут
          </span>
        </span>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="akt akt--bad">
        <Icon name="alert" size={16} />
        <span className="akt__body">
          <span className="akt__title">Распознать акт не удалось</span>
          <span className="akt__note">{state.message}</span>
        </span>
        <button className="doc__act" onClick={onClose} aria-label="Закрыть">
          <Icon name="x" size={13} />
        </button>
      </div>
    )
  }

  const { result } = state
  const { extract } = result

  return (
    <div className="akt akt--ok">
      <Icon name="sparkles" size={16} />
      <span className="akt__body">
        <span className="akt__title">
          Акт {extract.actNumber ? `№ ${extract.actNumber}` : 'без номера'}
          {extract.actDate ? ` от ${extract.actDate}` : ''} · распознано позиций: {extract.devices.length}
        </span>
        <span className="akt__note">{result.ai}</span>

        {result.created.length > 0 && (
          <span className="akt__note">
            Заведены заявки: {result.created.map((r) => `№ ${r.number} — ${r.equipment}`).join(' · ')}
          </span>
        )}

        {result.attachedDocs > 0 && (
          <span className="akt__note">Документов Word приложено к заявкам: {result.attachedDocs}</span>
        )}

        {result.folder && (
          <span className="akt__folder">
            <span className="akt__path" title={result.folder}>
              {result.folder}
            </span>
            <button className="btn btn--sm" onClick={() => onOpenFolder(result.folder as string)}>
              <Icon name="folder" size={13} />
              Открыть папку
            </button>
          </span>
        )}

        {result.warnings.map((w) => (
          <span className="akt__warn" key={w}>
            <Icon name="alert" size={12} /> {w}
          </span>
        ))}
      </span>

      <button className="doc__act" onClick={onClose} aria-label="Закрыть">
        <Icon name="x" size={13} />
      </button>
    </div>
  )
}
