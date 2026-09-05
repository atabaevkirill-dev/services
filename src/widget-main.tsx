import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './theme/ThemeProvider'
import { WidgetPanel } from './widget/WidgetPanel'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <WidgetPanel />
    </ThemeProvider>
  </StrictMode>,
)
