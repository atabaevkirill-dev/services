import { isTauri } from '../repairs/repo'
import type { Attachment } from '../repairs/types'

/**
 * Действия над вложением за пределами приложения: открыть системной программой,
 * показать в папке, сохранить копию.
 *
 * В настольной сборке всё идёт через путь на диске (`file.path`) и плагины Tauri:
 * asset-ссылка годится только для <img> и <video>, обычная ссылка с `download`
 * или `target="_blank"` внутри WebView ничего полезного не делает.
 * В браузере файла на диске нет, поэтому работаем с blob-ссылкой.
 */

/** Показать файл в проводнике можно только там, где он лежит на диске. */
export const canRevealInFolder = (file: Attachment): boolean => isTauri() && Boolean(file.path)

/** Открывает файл программой, назначенной в системе (Word, просмотр фото, плеер). */
export async function openExternally(file: Attachment): Promise<void> {
  if (isTauri()) {
    if (!file.path) throw new Error('Путь к файлу неизвестен')
    const { openPath } = await import('@tauri-apps/plugin-opener')
    await openPath(file.path)
    return
  }
  const opened = window.open(file.src, '_blank', 'noopener')
  if (!opened) throw new Error('Браузер заблокировал открытие файла в новой вкладке')
}

/** Показывает файл в проводнике — выделенным, а не просто открывает папку. */
export async function revealInFolder(file: Attachment): Promise<void> {
  if (!canRevealInFolder(file)) throw new Error('Показать в папке можно только в настольной сборке')
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  await revealItemInDir(file.path as string)
}

/** Сохраняет копию файла туда, куда укажет пользователь. */
export async function saveCopy(file: Attachment): Promise<void> {
  if (isTauri() && file.path) {
    const [{ save }, fs] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')])
    const target = await save({ defaultPath: file.fileName })
    if (!target) return
    // копируем на уровне файловой системы: видео с телефона в память не поднимаем
    await fs.copyFile(file.path, target)
    return
  }

  const response = await fetch(file.src)
  if (!response.ok) throw new Error('Не удалось прочитать файл из хранилища')
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = file.fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Копирует в буфер обмена путь к файлу, а в браузере — ссылку на него. */
export async function copyLocation(file: Attachment): Promise<string> {
  const value = file.path ?? file.src
  await navigator.clipboard.writeText(value)
  return file.path ? 'Путь скопирован' : 'Ссылка скопирована'
}

/** Открывает папку в проводнике. Путь выбирает пользователь в настройках. */
export async function openFolder(folder: string): Promise<void> {
  if (!isTauri()) throw new Error('Открыть папку можно только в настольной сборке')
  const { openPath } = await import('@tauri-apps/plugin-opener')
  await openPath(folder)
}
