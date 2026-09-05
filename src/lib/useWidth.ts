import { useEffect, useState } from 'react'

/** Ширина окна в CSS-пикселях — источник для адаптивной раскладки таблицы и панелей. */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth))
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}
