import { isTauri } from '../repairs/repo'

/** Сохраняет файл: в настольной сборке через системный диалог, в браузере — обычной загрузкой. */
export async function saveBlob(fileName: string, blob: Blob): Promise<void> {
  if (isTauri()) {
    const [{ save }, fs] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')])
    const target = await save({ defaultPath: fileName })
    if (!target) return
    await fs.writeFile(target, new Uint8Array(await blob.arrayBuffer()))
    return
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`
}
