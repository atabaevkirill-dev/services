import { isTauri } from '../repairs/repo'

/**
 * Держит окна в согласии: любое изменение данных в одном окне заставляет другое
 * перечитать список. В браузере подписка не нужна — окно всего одно.
 */
export async function subscribeChanges(handlers: {
  onChanged: () => void
  onOpen?: (repairId: number) => void
}): Promise<() => void> {
  if (!isTauri()) return () => undefined

  const { listen } = await import('@tauri-apps/api/event')
  const stops = await Promise.all([
    listen('repairs:changed', () => handlers.onChanged()),
    listen<number>('repairs:open', (event) => handlers.onOpen?.(event.payload)),
  ])
  return () => stops.forEach((stop) => stop())
}
