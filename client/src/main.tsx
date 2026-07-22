import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { CTraderMarketProvider } from './context/CTraderMarketContext.tsx'
import { CTraderStatusProvider } from './context/CTraderStatusContext.tsx'
import { InstrumentProvider } from './context/InstrumentContext.tsx'
import { SessionProvider } from './context/SessionProvider.tsx'
import { ThemeProvider } from './context/ThemeContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <SessionProvider>
        <InstrumentProvider>
          <CTraderStatusProvider>
            <CTraderMarketProvider>
              <App />
            </CTraderMarketProvider>
          </CTraderStatusProvider>
        </InstrumentProvider>
      </SessionProvider>
    </ThemeProvider>
  </StrictMode>,
)
