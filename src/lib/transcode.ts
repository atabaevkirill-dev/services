import type { Attachment } from '../repairs/types'

export class NotImplementedError extends Error {}

/**
 * Готовит видео к просмотру внутри приложения.
 *
 * TODO (этап Tauri): подключить ffmpeg отдельным бинарником и по требованию
 * приводить запись к mp4 (H.264 + AAC), сохраняя оригинал:
 *  - контейнер mkv/avi/mts с H.264 внутри — перепаковка без перекодирования (секунды);
 *  - HEVC с iPhone и всё остальное — полноценное перекодирование с аппаратным ускорением.
 * Результат кладётся рядом как производный файл, плеер переключается на него.
 */
export async function ensurePlayable(_file: Attachment): Promise<Attachment> {
  throw new NotImplementedError('Конвертация появится в десктопной сборке')
}
