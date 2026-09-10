import { create } from 'zustand'
import type { ActState } from './ActPanel'

/**
 * Итог распознавания, которое запустилось не в карточке.
 *
 * Акт из формы создания обрабатывается до того, как карточка откроется,
 * поэтому показать предупреждения ей самой некуда. Результат кладётся сюда,
 * а файловый менеджер забирает его при открытии нужной заявки.
 */
interface ActResultState {
  pending: { repairId: number; state: ActState } | null
  put(repairId: number, state: ActState): void
  take(repairId: number): ActState | null
}

export const useActResult = create<ActResultState>()((set, get) => ({
  pending: null,
  put: (repairId, state) => set({ pending: { repairId, state } }),
  take: (repairId) => {
    const pending = get().pending
    if (!pending || pending.repairId !== repairId) return null
    set({ pending: null })
    return pending.state
  },
}))
