import type { RepairRepo } from './repo'

/**
 * SQLite-реализация появится вместе с оболочкой Tauri (этап 3).
 * До этого момента приложение работает через repo.mock в браузере.
 */
export async function createSqliteRepo(): Promise<RepairRepo> {
  throw new Error('SQLite-хранилище ещё не подключено')
}
