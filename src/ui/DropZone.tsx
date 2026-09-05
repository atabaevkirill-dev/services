import { useRef, useState } from 'react'
import { Icon } from './Icon'

export const FILE_ACCEPT =
  'image/*,video/*,.pdf,.doc,.docx,.rtf,.odt,.xls,.xlsx,.csv,.ods,.zip,.rar,.7z,.txt,.mkv,.avi,.mov,.wmv,.flv,.mpg,.mpeg,.mts,.m2ts,.ts,.3gp,.mxf,.vob'

/** Зона загрузки: клик открывает выбор файла, поддерживает перетаскивание. */
export function DropZone({
  onFiles,
  accept = FILE_ACCEPT,
  multiple = true,
  title = 'Перетащите файлы сюда',
  hint = 'или нажмите, чтобы выбрать — фото, PDF, Word, Excel',
  disabled = false,
}: {
  onFiles: (files: File[]) => void | Promise<void>
  accept?: string
  multiple?: boolean
  title?: string
  hint?: string
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const handle = (list: FileList | null) => {
    const files = list ? Array.from(list) : []
    if (files.length) void onFiles(files)
  }

  return (
    <div
      className="drop"
      data-over={over}
      data-disabled={disabled}
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) handle(e.dataTransfer.files)
      }}
    >
      <span className="drop__icon">
        <Icon name="upload" size={18} />
      </span>
      <span className="drop__title">{title}</span>
      <span className="drop__hint">{hint}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={(e) => {
          handle(e.target.files)
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}
