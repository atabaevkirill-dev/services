/**
 * Хранилище файлов вложений в IndexedDB: видео и крупные фото не помещаются
 * в localStorage, поэтому содержимое лежит здесь, а метаданные — в снимке базы.
 */
const DB_NAME = 'services.files'
const STORE = 'blobs'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Не удалось открыть хранилище файлов'))
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = action(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('Ошибка хранилища файлов'))
      }),
  )
}

export const putBlob = (key: string, blob: Blob) => run('readwrite', (s) => s.put(blob, key))
export const getBlob = (key: string) => run<Blob | undefined>('readonly', (s) => s.get(key))
export const deleteBlob = (key: string) => run('readwrite', (s) => s.delete(key))
export const clearBlobs = () => run('readwrite', (s) => s.clear())

const urls = new Map<string, string>()

/** Ссылка на файл, пригодная для <img>, <video> и открытия в новой вкладке. */
export async function blobUrl(key: string): Promise<string> {
  const cached = urls.get(key)
  if (cached) return cached
  const blob = await getBlob(key)
  if (!blob) return ''
  const url = URL.createObjectURL(blob)
  urls.set(key, url)
  return url
}

export function forgetUrl(key: string): void {
  const url = urls.get(key)
  if (!url) return
  URL.revokeObjectURL(url)
  urls.delete(key)
}

export function forgetAllUrls(): void {
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
}
