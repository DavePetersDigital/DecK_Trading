import { useEffect, useRef, useState } from 'react'
import './App.css'
import { Header, Sidebar } from './components/Chrome'
import { MockPriceController } from './components/MockPriceController'
import { useInstrumentStore } from './context/InstrumentContext'
import { defaultSettings } from './data/mockData'
import { AdminPage, AlertsPage, InstrumentPage, OverviewPage } from './pages/DashboardPages'
import { createDefaultInstrumentState } from './services/instrumentStore'
import type { AppSettings, InstrumentTab, View } from './types'

function initialRoute(): { view: View; symbol?: string } {
  const instrumentMatch = window.location.pathname.match(/^\/instruments\/([^/]+)$/i)
  if (instrumentMatch) return { view: 'instrument', symbol: decodeURIComponent(instrumentMatch[1]).toUpperCase() }
  if (window.location.pathname.toLowerCase() === '/gold') return { view: 'instrument', symbol: 'XAUUSD' }
  if (window.location.pathname.toLowerCase() === '/alerts') return { view: 'alerts' }
  if (window.location.pathname.toLowerCase() === '/admin') return { view: 'admin' }
  return { view: 'overview' }
}

function App() {
  const initialRouteRef = useRef(initialRoute())
  const [view, setView] = useState<View>(initialRouteRef.current.view)
  const [instrumentTab, setInstrumentTab] = useState<InstrumentTab>('overview')
  const instrumentStore = useInstrumentStore()
  const selectInstrumentRef = useRef(instrumentStore.selectInstrument)
  selectInstrumentRef.current = instrumentStore.selectInstrument
  const instrument = instrumentStore.current
  const [settings, setSettings] = useState<AppSettings>(() => {
    try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem('dp-settings') ?? '{}') } }
    catch { return defaultSettings }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    localStorage.setItem('dp-settings', JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    if (initialRouteRef.current.symbol) selectInstrumentRef.current(initialRouteRef.current.symbol)
    const onPopState = () => {
      const next = initialRoute()
      if (next.symbol) selectInstrumentRef.current(next.symbol)
      setView(next.view)
      setInstrumentTab('overview')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (nextView: View) => {
    setView(nextView)
    const path = nextView === 'overview' ? '/' : `/${nextView}`
    window.history.pushState({}, '', path)
  }

  const openInstrument = (symbol: string, tab: InstrumentTab = 'overview') => {
    if (!instrumentStore.selectInstrument(symbol)) return
    setInstrumentTab(tab)
    setView('instrument')
    window.history.pushState({}, '', `/instruments/${symbol}`)
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={navigate} onInstrument={openInstrument} />
      <div className="workspace">
        <Header instrument={instrument} view={view} />
        {view === 'overview' && <OverviewPage onOpenInstrument={openInstrument} />}
        {view === 'instrument' && <InstrumentPage tab={instrumentTab} onTab={setInstrumentTab} />}
        {view === 'alerts' && <AlertsPage />}
        {view === 'admin' && <AdminPage settings={settings} onSettings={setSettings} />}
      </div>
      <MockPriceController price={instrument.price} config={instrument.config} resetPrice={createDefaultInstrumentState(instrument.config).price} onChange={instrumentStore.actions.setPrice} />
    </div>
  )
}

export default App
