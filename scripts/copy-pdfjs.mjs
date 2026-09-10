/**
 * Кладёт рядом со сборкой то, что pdfjs подгружает в рантайме по URL.
 *
 * Сканы актов — это картинки JBIG2 и JPEG2000, и с версии 6 pdfjs декодирует их
 * через WASM, который сам не бандлится: без этих файлов отрисовка страницы
 * молча зависает, без ошибки в консоли. Шрифты нужны текстовым PDF.
 *
 * Запускается перед dev и build, поэтому после `npm install` ничего
 * дополнительно делать не надо.
 */
import { cp, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..'
const from = path.join(root, 'node_modules', 'pdfjs-dist')
const to = path.join(root, 'public', 'pdfjs')

const parts = ['wasm', 'standard_fonts']

if (!existsSync(from)) {
  console.error('pdfjs-dist не установлен — выполните npm install')
  process.exit(1)
}

await mkdir(to, { recursive: true })
for (const part of parts) {
  const src = path.join(from, part)
  if (!existsSync(src)) {
    console.error(`в pdfjs-dist нет папки ${part} — проверьте версию пакета`)
    process.exit(1)
  }
  await cp(src, path.join(to, part), { recursive: true })
}

console.log('pdfjs: ' + parts.join(', ') + ' скопированы в public/pdfjs')
