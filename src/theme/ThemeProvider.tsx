import { useEffect } from 'react'
import { useSettings } from '../settings/store'
import { FONTS, hexToRgbTriplet, resolveMode } from './themes'
import './tokens.css'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { themeMode, accent, fontKey, fontSize, density, radius } = useSettings()

  useEffect(() => {
    const root = document.documentElement
    const apply = () => root.setAttribute('data-theme', resolveMode(themeMode))
    apply()
    if (themeMode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [themeMode])

  useEffect(() => {
    const root = document.documentElement
    const font = FONTS.find((f) => f.key === fontKey) ?? FONTS[0]
    root.setAttribute('data-density', density)
    root.style.setProperty('--accent', accent)
    root.style.setProperty('--accent-rgb', hexToRgbTriplet(accent))
    root.style.setProperty('--font-ui', font.css)
    root.style.setProperty('--fs-base', `${fontSize}px`)
    root.style.setProperty('--radius', `${radius}px`)
    root.style.setProperty('--radius-sm', `${Math.max(4, radius - 3)}px`)
    root.style.setProperty('--radius-lg', `${radius + 4}px`)
  }, [accent, fontKey, fontSize, density, radius])

  return <>{children}</>
}
