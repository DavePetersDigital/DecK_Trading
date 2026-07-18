import { useEffect, useState } from 'react'
import './App.css'
import { Header, Sidebar } from './components/Chrome'
import { MockPriceController } from './components/MockPriceController'
import { useGold } from './context/GoldContext'
import { defaultSettings } from './data/mockData'
import { AdminPage, AlertsPage, GoldPage, OverviewPage } from './pages/DashboardPages'
import type { AppSettings, GoldTab, View } from './types'

function App() {
  const [view, setView] = useState<View>('overview')
  const [goldTab, setGoldTab] = useState<GoldTab>('overview')
  const gold = useGold()
  const [settings, setSettings] = useState<AppSettings>(() => {
    try { return { ...defaultSettings, ...JSON.parse(localStorage.getItem('dp-settings') ?? '{}') } }
    catch { return defaultSettings }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    localStorage.setItem('dp-settings', JSON.stringify(settings))
  }, [settings])

  const openGold = (tab: GoldTab = 'overview') => {
    setGoldTab(tab)
    setView('gold')
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={setView} />
      <div className="workspace">
        <Header price={gold.price} compact={view === 'admin' || view === 'alerts' || view === 'overview'} />
        {view === 'overview' && <OverviewPage onOpenGold={() => openGold('overview')} />}
        {view === 'gold' && <GoldPage tab={goldTab} onTab={setGoldTab} />}
        {view === 'alerts' && <AlertsPage />}
        {view === 'admin' && <AdminPage settings={settings} onSettings={setSettings} />}
      </div>
      <MockPriceController price={gold.price} onChange={gold.setPrice} />
    </div>
  )
}

export default App
