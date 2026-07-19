import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { InstrumentProvider } from './context/InstrumentContext.tsx'
import { SessionProvider } from './context/SessionProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <InstrumentProvider>
        <App />
      </InstrumentProvider>
    </SessionProvider>
  </StrictMode>,
)
