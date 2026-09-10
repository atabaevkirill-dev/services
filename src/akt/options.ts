import { useSettings } from '../settings/store'
import type { ActOptions } from './pipeline'

/**
 * Настройки распознавания в том виде, в каком их ждёт конвейер.
 * Отдельный переходник, чтобы поля не расходились между формой создания,
 * карточкой заявки и настройками.
 */
export function useActOptions(): ActOptions {
  const s = useSettings()
  return {
    provider: s.visionProvider,
    ollamaUrl: s.ollamaUrl,
    ollamaModel: s.ollamaModel,
    openaiBaseUrl: s.openaiBaseUrl,
    openaiKey: s.openaiKey,
    openaiModel: s.openaiModel,
    savePath: s.aktSavePath,
    createRepairs: s.aktCreateRepairs,
    numberFromAct: s.aktNumberFromAct,
  }
}
