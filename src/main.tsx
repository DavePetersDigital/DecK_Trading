import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GoldProvider } from './context/GoldContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoldProvider>
      <App />
    </GoldProvider>
  </StrictMode>,
)
