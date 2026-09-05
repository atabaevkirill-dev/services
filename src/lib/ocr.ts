import type { RepairDraft } from '../repairs/types'

export class NotImplementedError extends Error {}

/**
 * Заглушка автозаполнения заявки из скана акта приёма (PDF/JPG).
 *
 * TODO: распознавать в скане наименование оборудования, серийный/инвентарный
 * номер, номер акта и список неисправностей, возвращая готовый черновик заявки.
 * Планируемая реализация: текстовый слой PDF, если он есть; иначе OCR страницы
 * с последующим разбором полей.
 */
export async function recognizeFromScan(_file: File): Promise<Partial<RepairDraft>> {
  throw new NotImplementedError(
    'Автозаполнение из скана появится в следующей версии: файл будет прикреплён к заявке, а поля — заполнены из акта.',
  )
}
