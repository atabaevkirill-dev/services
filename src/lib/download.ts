import { isTauri } from '../repairs/repo'

/**
 * Сохраняет файл на диск.
 * TODO (этап Tauri): заменить на диалог сохранения `@tauri-apps/plugin-dialog`
 * с записью через `@tauri-apps/plugin-fs`, чтобы файл не уходил в «Загрузки».
 */
export async function saveBlob(fileName: string, blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
  if (isTauri()) return
}

export function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`
}
