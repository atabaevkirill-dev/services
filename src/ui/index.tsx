import { useEffect, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import './ui.css'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'ghost' | 'danger'
  size?: 'md' | 'sm'
  icon?: IconName
}

export function Button({ variant = 'default', size = 'md', icon, children, className = '', ...rest }: ButtonProps) {
  const classes = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    size === 'sm' ? 'btn--sm' : '',
    !children ? 'btn--icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type="button" className={classes} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  )
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {error && <span className="field__error">{error}</span>}
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="seg__item"
          data-on={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-on={checked}
      onClick={() => onChange(!checked)}
    />
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal__backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width: `min(${width}px, 100%)` } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" icon="x" onClick={onClose} aria-label="Закрыть" />
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ icon = 'inbox', title, hint }: { icon?: IconName; title: string; hint?: string }) {
  return (
    <div className="empty">
      <span className="empty__icon">
        <Icon name={icon} size={20} />
      </span>
      <span className="empty__title">{title}</span>
      {hint && <span style={{ fontSize: 'var(--fs-sm)' }}>{hint}</span>}
    </div>
  )
}

export { Icon }
export { Lightbox } from './Lightbox'
export { DropZone, FILE_ACCEPT } from './DropZone'
export type { IconName }
