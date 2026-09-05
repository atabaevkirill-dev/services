import { isTauri } from '../repairs/repo'

/** Открывает главное окно приложения; в браузере просто переходит на главную страницу. */
export async function openMainWindow(repairId?: number): Promise<void> {
  if (!isTauri()) {
    window.location.href = repairId ? `/index.html#repair-${repairId}` : '/index.html'
    return
  }
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('show_main_window', { repairId: repairId ?? null })
}
