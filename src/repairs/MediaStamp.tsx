import { useSettings } from '../settings/store'
import type { Repair } from './types'

/**
 * Штамп поверх фото и видео: дата, время, оборудование — как на записи с камеры.
 * Накладывается при просмотре, сам файл не изменяется.
 */
export function MediaStamp({ repair, at, size = 'md' }: { repair: Repair | null; at: string; size?: 'sm' | 'md' }) {
  const s = useSettings()
  if (!s.stampEnabled || !repair) return null

  const d = new Date(at)
  const valid = !Number.isNaN(d.getTime())
  const date = valid ? d.toLocaleDateString('ru-RU') : ''
  const time = valid ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''

  const head = [s.stampDate ? date : '', s.stampTime ? time : ''].filter(Boolean).join(' ')
  const tail = [s.stampNumber ? `№ ${repair.number}` : '', s.stampLocation ? repair.location : ''].filter(Boolean).join(' · ')

  if (!head && !s.stampEquipment && !tail) return null

  return (
    <div className="stamp" data-pos={s.stampPosition} data-size={size}>
      {head && <span className="stamp__time">{head}</span>}
      {s.stampEquipment && <span className="stamp__name">{repair.equipment}</span>}
      {tail && <span className="stamp__meta">{tail}</span>}
    </div>
  )
}
