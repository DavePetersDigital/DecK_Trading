import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GoldProvider } from './context/GoldContext.tsx'
import { SessionProvider } from './context/SessionProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <GoldProvider>
        <App />
      </GoldProvider>
    </SessionProvider>
  </StrictMode>,
)
