export type ThemeMode = 'dark' | 'light' | 'auto'
export type Density = 'compact' | 'comfortable'
export type FontKey = 'inter' | 'plex' | 'mono' | 'system'

export const FONTS: { key: FontKey; label: string; css: string }[] = [
  { key: 'inter', label: 'Inter', css: 'var(--font-inter)' },
  { key: 'plex', label: 'IBM Plex', css: 'var(--font-plex)' },
  { key: 'mono', label: 'JetBrains Mono', css: 'var(--font-mono)' },
  { key: 'system', label: 'Системный', css: 'var(--font-system)' },
]

export const ACCENTS: { key: string; label: string; hex: string }[] = [
  { key: 'indigo', label: 'Индиго', hex: '#6366f1' },
  { key: 'cyan', label: 'Циан', hex: '#06b6d4' },
  { key: 'emerald', label: 'Изумруд', hex: '#10b981' },
  { key: 'amber', label: 'Янтарь', hex: '#f59e0b' },
  { key: 'rose', label: 'Роза', hex: '#f43f5e' },
  { key: 'violet', label: 'Фиалка', hex: '#a855f7' },
  { key: 'blue', label: 'Синий', hex: '#3b82f6' },
  { key: 'lime', label: 'Лайм', hex: '#84cc16' },
]

export function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const n = Number.parseInt(full, 16)
  if (full.length !== 6 || Number.isNaN(n)) return '99 102 241'
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

export function isValidHex(hex: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex.trim())
}

export function resolveMode(mode: ThemeMode): 'dark' | 'light' {
  if (mode !== 'auto') return mode
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}
