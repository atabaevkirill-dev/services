import { getRepo } from '../repairs/repo'
import { useRepairs } from '../repairs/store'
import { loadBytes } from '../lib/preview'
import { extractAct } from './extract'
import { actFolderName, buildDocuments, saveActFolder, splitPdfPages, type ActFile } from './save'
import type { ActExtract, ActFields, DeviceExtract, VisionSettings } from './types'
import type { Attachment, Repair, RepairDraft } from '../repairs/types'

/**
 * Что происходит с распознанным входным актом.
 *
 * Заявка у нас на одно оборудование, а в акте их бывает несколько: первый прибор
 * достаётся текущей заявке, на остальные заводятся отдельные. На каждый прибор
 * готовится свой документ Word — он ложится и в папку акта на диске, и во
 * вложения своей заявки.
 *
 * Распознавание (`extractAct`) отделено от последующих действий (`applyExtract`)
 * намеренно: при создании заявки акт распознаётся ещё до того, как заявка
 * появится, поля показываются в форме, и человек успевает их поправить.
 */

export interface ActOptions extends VisionSettings {
  /** Куда складывать папки актов. Пусто — только вложения. */
  savePath: string
  /** Заводить заявки на остальные приборы акта. */
  createRepairs: boolean
  /** Подставлять номер акта номером заявки. */
  numberFromAct: boolean
}

export interface ActRunResult {
  ai: string
  extract: ActExtract
  created: { number: string; equipment: string }[]
  folder: string | null
  savedFiles: string[]
  attachedDocs: number
  warnings: string[]
}

export type ActStage = (text: string) => void

/** «30.03.2026» → ISO. Полдень, чтобы часовой пояс не сдвинул дату на сутки. */
export function actDateToIso(actDate: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((actDate || '').trim())
  if (!m) return null
  const d = new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T12:00:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Поля заявки из распознанной позиции акта. */
export function draftFromDevice(
  device: DeviceExtract,
  extract: ActExtract,
  base?: Repair | null,
): Partial<RepairDraft> {
  const receivedAt = actDateToIso(extract.actDate)
  const patch: Partial<RepairDraft> = {
    equipment: device.productName || base?.equipment || 'Без наименования',
    serialNo: device.serialNumber || null,
    problem: device.declaredDefects || null,
    notes: device.detectedDefects || null,
  }
  if (receivedAt) patch.receivedAt = receivedAt
  return patch
}

function fieldsFromDevice(device: DeviceExtract, extract: ActExtract): ActFields {
  return {
    actNumber: extract.actNumber,
    actDate: extract.actDate,
    productName: device.productName,
    serialNumber: device.serialNumber,
    declaredDefects: device.declaredDefects,
    detectedDefects: device.detectedDefects,
  }
}

const toDocFile = (f: ActFile) =>
  new File([f.data as BlobPart], f.name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })

export interface ApplyInput {
  repairId: number
  /** Содержимое скана акта — для страниц в папке и для вложений новых заявок. */
  actBytes: Uint8Array
  actFileName: string
  actMime: string
  extract: ActExtract
  /** Заполнять ли поля текущей заявки. В форме создания это уже сделано. */
  fillCurrent: boolean
}

/**
 * Всё, что следует за распознаванием. Сбой на любом шаге не отменяет уже
 * сделанного: заполненная заявка ценнее несозданной папки, поэтому такие
 * неудачи возвращаются предупреждениями, а не исключением.
 */
export async function applyExtract(
  input: ApplyInput,
  options: ActOptions,
  stage?: ActStage,
): Promise<ActRunResult> {
  const { repairId, actBytes, actFileName, actMime, extract, fillCurrent } = input
  const repo = await getRepo()
  const warnings: string[] = []

  if (extract.failedPages.length > 0) {
    warnings.push(`Страницы ${extract.failedPages.join(', ')} разобрать не удалось — проверьте поля вручную.`)
  }
  if (!extract.actNumber) warnings.push('Номер акта в скане не распознан.')
  if (!extract.actDate) warnings.push('Дата акта не распознана — документы Word получат имена без даты.')

  const current = await repo.get(repairId)
  const [firstDevice, ...restDevices] = extract.devices

  // 1. Первый прибор — в текущую заявку
  if (fillCurrent) {
    stage?.('Заполняю заявку')
    const patch = draftFromDevice(firstDevice, extract, current)
    if (options.numberFromAct && extract.actNumber) patch.number = extract.actNumber
    try {
      await repo.update(repairId, patch)
    } catch (e) {
      // чаще всего — занятый номер акта; поля пишем всё равно, номер оставляем прежний
      warnings.push(e instanceof Error ? e.message : 'Не удалось записать поля заявки')
      delete patch.number
      await repo.update(repairId, patch)
    }
  }

  // 2. Остальные приборы — отдельными заявками, акт прикладываем к каждой
  const created: { number: string; equipment: string }[] = []
  const repairIds = [repairId]

  if (options.createRepairs && restDevices.length > 0) {
    const actFile = new File([actBytes as BlobPart], actFileName, { type: actMime })
    for (const device of restDevices) {
      stage?.(`Завожу заявку на «${device.productName || 'прибор'}»`)
      try {
        const draft = draftFromDevice(device, extract, current)
        const repair = await repo.create({
          number: '',
          receivedAt: draft.receivedAt ?? new Date().toISOString(),
          equipment: draft.equipment ?? 'Без наименования',
          serialNo: draft.serialNo ?? null,
          fromWhom: current?.fromWhom ?? null,
          contact: current?.contact ?? null,
          location: current?.location ?? null,
          problem: draft.problem ?? null,
          status: current?.status ?? 'accepted',
          notes: draft.notes ?? null,
          issuedAt: null,
        })
        await repo.addAttachment(repair.id, actFile, 'act')
        repairIds.push(repair.id)
        created.push({ number: repair.number, equipment: repair.equipment })
      } catch (e) {
        warnings.push(
          `Заявку на «${device.productName}» завести не удалось: ${e instanceof Error ? e.message : 'ошибка'}`,
        )
      }
    }
  }

  // 3. Документы Word — по одному на прибор
  stage?.('Готовлю документы Word')
  const usedDevices = options.createRepairs ? extract.devices : [firstDevice]
  let documents: ActFile[] = []
  try {
    documents = await buildDocuments(usedDevices.map((d) => fieldsFromDevice(d, extract)))
  } catch (e) {
    warnings.push(`Документы Word не собрались: ${e instanceof Error ? e.message : 'ошибка шаблона'}`)
  }

  // 4. Папка акта на диске: документы плюс страницы скана
  let folder: string | null = null
  let savedFiles: string[] = []
  if (options.savePath.trim() && documents.length > 0) {
    stage?.('Сохраняю папку акта')
    try {
      const pages = /\.pdf$/i.test(actFileName)
        ? await splitPdfPages(actBytes)
        : { files: [{ name: actFileName, data: actBytes }], warning: '' }
      if (pages.warning) warnings.push(pages.warning)

      const result = await saveActFolder(
        options.savePath.trim(),
        actFolderName(extract.actDate, extract.actNumber),
        [...documents, ...pages.files],
      )
      folder = result.folder
      savedFiles = result.saved
    } catch (e) {
      warnings.push(`Папку акта сохранить не удалось: ${e instanceof Error ? e.message : 'ошибка записи'}`)
    }
  }

  // 5. Документы во вложения своих заявок
  stage?.('Прикладываю документы к заявкам')
  let attachedDocs = 0
  for (let i = 0; i < documents.length; i += 1) {
    const target = repairIds[i]
    if (target === undefined) break
    try {
      await repo.addAttachment(target, toDocFile(documents[i]), 'doc')
      attachedDocs += 1
    } catch (e) {
      warnings.push(`Документ «${documents[i].name}» приложить не удалось: ${e instanceof Error ? e.message : 'ошибка'}`)
    }
  }

  // список и открытая карточка перечитываются один раз, в конце
  const store = useRepairs.getState()
  await store.load()
  await store.refreshDetails()

  return { ai: extract.ai, extract, created, folder, savedFiles, attachedDocs, warnings }
}

/** Распознать уже приложенный акт и выполнить всё остальное. */
export async function runAct(
  repairId: number,
  act: Attachment,
  options: ActOptions,
  stage?: ActStage,
): Promise<ActRunResult> {
  stage?.('Читаю файл акта')
  const actBytes = new Uint8Array(await loadBytes(act))

  stage?.('Распознаю страницы')
  const extract = await extractAct(new Blob([actBytes as BlobPart]), act.fileName, options, (done, total) =>
    stage?.(`Распознаю страницу ${done} из ${total}`),
  )
  if (extract.devices.length === 0) {
    throw new Error('В акте не удалось распознать ни одной позиции оборудования')
  }

  return applyExtract(
    { repairId, actBytes, actFileName: act.fileName, actMime: act.mime, extract, fillCurrent: true },
    options,
    stage,
  )
}
