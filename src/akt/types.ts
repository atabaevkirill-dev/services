/** Одна позиция оборудования, распознанная в акте. */
export interface DeviceExtract {
  productName: string
  serialNumber: string
  declaredDefects: string
  detectedDefects: string
  /** Страница акта, на которой позиция найдена. 0 — добавлена вручную. */
  page: number
}

/** Поля, которыми заполняется шаблон Word. Одно устройство — один документ. */
export interface ActFields {
  actNumber: string
  /** ДД.ММ.ГГГГ */
  actDate: string
  productName: string
  serialNumber: string
  declaredDefects: string
  detectedDefects: string
  techCondition?: string
  performedWorks?: string
  /** Если пусто — берётся actDate. */
  diagDate?: string
}

/** Результат распознавания акта целиком. */
export interface ActExtract {
  actNumber: string
  actDate: string
  devices: DeviceExtract[]
  /** Сколько страниц удалось растеризовать. */
  totalPages: number
  /** Страницы, ответ модели по которым не разобрался. */
  failedPages: number[]
  /** Подпись провайдера для интерфейса. */
  ai: string
}

export type VisionProvider = 'ollama' | 'openai'

export interface VisionSettings {
  provider: VisionProvider
  ollamaUrl: string
  ollamaModel: string
  openaiBaseUrl: string
  openaiKey: string
  openaiModel: string
}
