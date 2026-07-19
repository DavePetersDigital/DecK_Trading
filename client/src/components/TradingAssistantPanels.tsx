import { useEffect, useMemo, useState } from 'react'
import { useInstrumentWorkspace } from '../context/InstrumentContext'
import type { ActivityCategory, Bias, InstrumentTab, PlannedLevel } from '../types'
import {
  calculateInstrumentStatus, calculateLevelStatus,
  calculateManipulationClassification, calculateNearestLevel,
  calculateNearestSupportResistance, calculateNextAction, formatDistance,
  formatPrice, statusTone,
} from '../utils/trading'
import { Card, Toggle } from './Cards'
import { StatusBadge } from './Chrome'
import { SessionStatusCard } from './SessionComponents'
import { useSession } from '../hooks/useSession'
import { formatSessionDuration } from '../services/sessionEngine'
import { DailyPlanImportModal } from './DailyPlanImportModal'
import type { ParsedDailyPlan, PlanImportMode } from '../types/dailyPlanImport'
import { buildImportedDailyPlan } from '../utils/dailyPlanImport'

export function InstrumentOperationalSubtitle() {
  const gold = useInstrumentWorkspace()
  const session = useSession()
  const marketSession = session.sessions[gold.config.preferredSession]
  const nearest = calculateNearestLevel(gold.price, gold.plan.levels)
  const levelStatus = nearest ? calculateLevelStatus(gold.price, nearest) : 'DISABLED'
  const sessionLabel = `${marketSession.name} ${marketSession.state === 'OPEN' ? 'open' : marketSession.state === 'CLOSING_SOON' ? 'closing soon' : marketSession.state === 'OPENING_SOON' ? 'opens soon' : 'closed'}`

  if (!gold.monitoring) return <p>Monitoring off • Enable monitoring to resume trading alerts</p>
  if (gold.manipulation.reclaimed) return <p>Manipulation reclaim confirmed • Watch M1 for entry confirmation</p>
  if (gold.orb.breakoutDirection) return <p>Waiting for breakout confirmation • Watch the next candle close</p>
  if (levelStatus === 'APPROACHING' || levelStatus === 'ALERT SENT' || levelStatus === 'IN ZONE') {
    return <p>Price approaching {nearest?.direction.toLowerCase()} level • {levelStatus === 'IN ZONE' ? 'Watch M1' : 'Prepare M1'}</p>
  }
  if (marketSession.isActive && !gold.orb.rangeComplete) {
    return <p>{sessionLabel} • ORB building • M15 closes in {String(session.candles.M15.minutes).padStart(2, '0')}:{String(session.candles.M15.seconds).padStart(2, '0')}</p>
  }
  return <p>{sessionLabel} • {nearest ? `Monitoring ${nearest.direction} ${formatPrice(nearest.price, gold.config.priceDecimals)} • ${formatPrice(Math.abs(nearest.price - gold.price), gold.config.priceDecimals)} away` : 'No active daily-plan level'}</p>
}

export function InstrumentOverview({ onTab }: { onTab: (tab: InstrumentTab) => void }) {
  const gold = useInstrumentWorkspace()
  const session = useSession()
  const marketSession = session.sessions[gold.config.preferredSession]
  const nearest = calculateNearestLevel(gold.price, gold.plan.levels)
  const status = calculateInstrumentStatus(gold.monitoring, marketSession.isActive, nearest, gold.price)
  const next = calculateNextAction(gold.monitoring, marketSession.isActive, nearest, gold.price, gold.orb, gold.manipulation)
  const distance = nearest ? Math.abs(nearest.price - gold.price) : null
  const orbDistance = Math.min(Math.abs(gold.price - gold.orb.high), Math.abs(gold.price - gold.orb.low))
  const manipulation = calculateManipulationClassification(gold.manipulation)
  const levelStatus = nearest ? calculateLevelStatus(gold.price, nearest) : 'DISABLED'
  const reason = !gold.monitoring
    ? 'Price monitoring is switched off.'
    : nearest
      ? `Price is ${formatDistance(nearest.price - gold.price, gold.config.priceDecimals)} from today’s ${nearest.direction.toLowerCase()} level at ${formatPrice(nearest.price, gold.config.priceDecimals)}.`
      : 'No enabled daily-plan level is available.'

  const conditions = [
    ['Monitoring Enabled', gold.monitoring, gold.monitoring ? 'On' : 'Off'],
    ['Daily Plan Loaded', gold.plan.levels.length > 0, `${gold.plan.levels.length} levels`],
    ['Session Active', marketSession.isActive, `${marketSession.name} ${marketSession.state.replace('_', ' ').toLowerCase()}`],
    ['Opening Range Complete', gold.orb.rangeComplete, gold.orb.rangeComplete ? 'Complete' : 'Building'],
    ['Manipulation Confirmed', gold.manipulation.reclaimed, gold.manipulation.reclaimed ? 'Reclaim confirmed' : manipulation.classification],
    ['Breakout Detected', Boolean(gold.orb.breakoutDirection), gold.orb.breakoutDirection ?? 'None'],
    ['Alert Sent', Boolean(nearest?.alertSent), nearest?.alertSent ? 'Sent' : 'No'],
    ['Price Near Level', levelStatus === 'APPROACHING' || levelStatus === 'ALERT SENT' || levelStatus === 'IN ZONE', levelStatus],
  ] as const

  return (
    <div className="gold-overview-layout">
      <section className={`primary-status status-${statusTone(status)}`}>
        <div className="primary-status-top"><span>Primary status · {marketSession.name} {marketSession.state.replace('_', ' ').toLowerCase()}</span><StatusBadge tone={statusTone(status)}>{status}</StatusBadge></div>
        <div className="primary-status-main">
          <div><small>Current price</small><strong>{formatPrice(gold.price, gold.config.priceDecimals)}</strong></div>
          <div><small>Nearest level</small><strong>{nearest ? formatPrice(nearest.price, gold.config.priceDecimals) : '—'}</strong></div>
          <div><small>Distance</small><strong>{distance === null ? '—' : formatPrice(distance, gold.config.priceDecimals)}</strong></div>
        </div>
        <p>{reason}</p>
        <div className="status-next"><span>NEXT</span><strong>{next.detail}</strong></div>
        <small className="status-updated">Updated {new Date(gold.lastStatusUpdate).toLocaleTimeString()}</small>
      </section>

      <Card title="Next Action" eyebrow="Operational instruction" className="next-action-card" action={<StatusBadge tone={statusTone(status)}>{next.action}</StatusBadge>}>
        <div className="next-action-content"><strong>{next.action}</strong><p>{next.detail}</p></div>
      </Card>

      <div className="strategy-summary-grid">
        {gold.config.strategies.dailyPlan && <button className="strategy-panel" onClick={() => onTab('plan')}>
          <span>Daily Plan</span><StatusBadge tone={statusTone(levelStatus)}>{levelStatus}</StatusBadge>
          <strong>{nearest ? `${nearest.direction} ${formatPrice(nearest.price, gold.config.priceDecimals)}` : 'No level'}</strong>
          <p>{distance === null ? 'No distance' : `${formatPrice(distance, gold.config.priceDecimals)} away`} · Monitoring {gold.monitoring ? 'on' : 'off'}</p><small>Open Daily Plan →</small>
        </button>}
        {gold.config.strategies.orb && <button className="strategy-panel" onClick={() => onTab('orb')}>
          <span>ORB</span><StatusBadge tone={statusTone(gold.orb.state)}>{gold.orb.state}</StatusBadge>
          <strong>{gold.orb.rangeComplete ? 'Opening range complete' : 'Range building'}</strong>
          <p>{formatPrice(orbDistance, gold.config.priceDecimals)} to nearest boundary · Breakout {gold.orb.breakoutDirection ?? 'none'}</p><small>Open ORB →</small>
        </button>}
        {gold.config.strategies.manipulation && <button className="strategy-panel" onClick={() => onTab('manipulation')}>
          <span>Manipulation</span><StatusBadge tone={manipulation.percentage >= 20 ? 'warning' : 'neutral'}>{manipulation.classification}</StatusBadge>
          <strong>{gold.manipulation.state}</strong>
          <p>{manipulation.percentage.toFixed(1)}% of ATR · Reclaim {gold.manipulation.reclaimed ? 'confirmed' : 'waiting'}</p><small>Open Manipulation →</small>
        </button>}
        {!Object.values(gold.config.strategies).some(Boolean) && <div className="strategy-panel configuration-message"><strong>No strategies enabled</strong><p>Enable strategies in Instrument Management.</p></div>}
      </div>

      <Card title="Trading Checklist" eyebrow="Strategy pre-flight" className="checklist-card">
        <div className="conditions-grid">{conditions.map(([label, yes, detail]) => <div key={label}><i className={yes ? 'yes' : 'no'}>{yes ? '✓' : '○'}</i><span>{label}<small>{detail}</small></span></div>)}</div>
      </Card>

      <Card title="Market Context" eyebrow="Supporting market data" className="market-context-card">
        <div className="context-grid">
          {[['Price', formatPrice(gold.price, gold.config.priceDecimals)], ['Daily bias', gold.plan.bias], ['Daily range', '25.20'], ['Daily ATR', String(gold.orb.dailyAtr)], ['Session', `${marketSession.name} ${marketSession.state.replace('_', ' ')}`], ['Time remaining', formatSessionDuration(marketSession.timeRemaining)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </Card>

      <SessionStatusCard sessionId={gold.config.preferredSession} />
    </div>
  )
}

const orbProgress = [
  'Waiting for session', 'Building opening candle', 'Opening range complete', 'Waiting for breakout',
  'Breakout detected', 'Waiting for confirmation', 'Setup active', 'Finished',
]

export function InstrumentOrbWorkspace() {
  const gold = useInstrumentWorkspace()
  const orb = gold.orb
  const range = orb.high - orb.low
  const percentage = (range / orb.dailyAtr) * 100
  const inside = gold.price >= orb.low && gold.price <= orb.high
  const highDistance = Math.abs(orb.high - gold.price)
  const lowDistance = Math.abs(gold.price - orb.low)
  const nearest = highDistance < lowDistance ? 'OR High' : 'OR Low'
  const position = Math.max(0, Math.min(100, ((gold.price - orb.low) / range) * 100))
  const commentary = `The ${orb.session} opening range is ${orb.rangeComplete ? 'complete' : 'still building'}. The range is ${formatPrice(range, gold.config.priceDecimals)}, which is ${percentage.toFixed(1)}% of daily ATR. Price is currently ${inside ? 'inside' : 'outside'} the range and ${formatPrice(Math.min(highDistance, lowDistance), gold.config.priceDecimals)} from the ${nearest}. ${orb.breakoutDirection ? `A mock ${orb.breakoutDirection.toLowerCase()} breakout is awaiting candle-close confirmation.` : 'No breakout has been confirmed.'}`
  const currentIndex = orbProgress.indexOf(orb.state)

  return (
    <div className="strategy-workspace">
      <section className="process-panel">
        <div><span>Current ORB state · Mock</span><h2>{orb.state}</h2><p>Candle-close confirmation is required before a setup becomes active.</p></div>
        <button className="secondary" onClick={gold.resetOrb}>Reset ORB mock state</button>
      </section>
      <div className="process-steps">{orbProgress.map((step, index) => <div className={index === currentIndex ? 'active' : index < currentIndex ? 'done' : ''} key={step}><i>{index + 1}</i><span>{step}</span></div>)}</div>
      <div className="orb-detail-grid">
        <Card title="Opening Range" eyebrow={`${orb.session} mock data`}>
          <div className="context-grid orb-context">
            {[['OR High', formatPrice(orb.high, gold.config.priceDecimals)], ['OR Low', formatPrice(orb.low, gold.config.priceDecimals)], ['Range', formatPrice(range, gold.config.priceDecimals)], ['% of ATR', `${percentage.toFixed(1)}%`], ['To OR High', formatPrice(highDistance, gold.config.priceDecimals)], ['To OR Low', formatPrice(lowDistance, gold.config.priceDecimals)], ['Nearest boundary', nearest], ['Location', inside ? 'Inside range' : 'Outside range'], ['Breakout', orb.breakoutDirection ?? 'None'], ['Timestamp', orb.breakoutTimestamp ? new Date(orb.breakoutTimestamp).toLocaleTimeString() : '—']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
          <div className="range-chart">
            <div className="range-labels"><span>OR LOW <b>{formatPrice(orb.low, gold.config.priceDecimals)}</b></span><span>OR HIGH <b>{formatPrice(orb.high, gold.config.priceDecimals)}</b></span></div>
            <div className="range-line"><span className="price-pin" style={{ left: `${position}%` }}><i />{formatPrice(gold.price, gold.config.priceDecimals)}</span></div>
          </div>
        </Card>
        <Card title="Automatic Commentary" eyebrow="Live strategy interpretation">
          <div className="commentary-panel"><StatusBadge tone={inside ? 'neutral' : 'warning'}>{inside ? 'Inside range' : 'Mock breakout'}</StatusBadge><p>{commentary}</p><small>Mock data only. Actual candle-close data is not connected.</small></div>
        </Card>
      </div>
    </div>
  )
}

function LevelEditorRow({ level, priceStep, onChange, onDelete }: { level: PlannedLevel; priceStep: number; onChange: (patch: Partial<PlannedLevel>) => void; onDelete: () => void }) {
  return (
    <div className="level-editor-row">
      <select aria-label="Level direction" value={level.direction} onChange={(e) => onChange({ direction: e.target.value as PlannedLevel['direction'] })}><option>Buy</option><option>Sell</option></select>
      <input aria-label="Level price" type="number" step={priceStep} value={level.price} onChange={(e) => onChange({ price: Number(e.target.value), alertSent: false })} />
      <Toggle checked={level.enabled} onChange={(enabled) => onChange({ enabled })} label={`Enable ${level.direction} level`} />
      <button className="icon-button danger" onClick={onDelete} aria-label={`Delete ${level.direction} level`}>×</button>
    </div>
  )
}

export function InstrumentDailyPlanWorkspace() {
  const gold = useInstrumentWorkspace()
  const [bias, setBias] = useState(gold.plan.bias)
  const [approach, setApproach] = useState(gold.plan.approachDistance)
  const [tolerance, setTolerance] = useState(gold.plan.entryTolerance)
  const [notes, setNotes] = useState(gold.plan.notes ?? '')
  const [dateSessionLabel, setDateSessionLabel] = useState(gold.plan.dateSessionLabel ?? '')
  const [showImport, setShowImport] = useState(false)
  useEffect(() => {
    setBias(gold.plan.bias)
    setApproach(gold.plan.approachDistance)
    setTolerance(gold.plan.entryTolerance)
    setNotes(gold.plan.notes ?? '')
    setDateSessionLabel(gold.plan.dateSessionLabel ?? '')
  }, [gold.plan.bias, gold.plan.approachDistance, gold.plan.entryTolerance, gold.plan.notes, gold.plan.dateSessionLabel])

  const save = () => gold.savePlan({
    ...gold.plan, bias, approachDistance: approach, entryTolerance: tolerance,
    levels: gold.plan.levels.map((level) => ({ ...level, approachDistance: approach, entryTolerance: tolerance })),
    notes: notes || undefined,
    dateSessionLabel: dateSessionLabel || undefined,
    lastSaved: new Date().toISOString(),
  })
  const applyImport = (parsed: ParsedDailyPlan, mode: PlanImportMode) => {
    const imported = buildImportedDailyPlan(gold.plan, parsed, mode)
    gold.importPlan(imported.plan, { buyLevels: imported.buyLevels, sellLevels: imported.sellLevels, mode })
    setShowImport(false)
  }

  return (
    <>
      <div className="plan-workspace">
        <Card title="Plan Editor" eyebrow="Set once before session">
          <div className="plan-settings">
            <label>Daily bias<select value={bias} onChange={(e) => setBias(e.target.value as Bias)}><option>Bullish</option><option>Bearish</option><option>Neutral</option></select></label>
            <label>Approach distance<input type="number" min="0" step={gold.config.priceStep} value={approach} onChange={(e) => setApproach(Number(e.target.value))} /></label>
            <label>Entry tolerance<input type="number" min="0" step={gold.config.pointSize} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} /></label>
            <label className="plan-label">Date / session label<input value={dateSessionLabel} placeholder="Optional" onChange={(e) => setDateSessionLabel(e.target.value)} /></label>
            <label className="plan-notes">Plan notes<textarea value={notes} placeholder="Optional daily plan notes" onChange={(e) => setNotes(e.target.value)} /></label>
          </div>
          <div className="level-editor-list">
            <div className="editor-labels"><span>Direction</span><span>Entry level</span><span>Enabled</span><span /></div>
            {gold.plan.levels.map((level) => <LevelEditorRow key={level.id} level={level} priceStep={gold.config.priceStep} onChange={(patch) => gold.updateLevel(level.id, patch)} onDelete={() => gold.removeLevel(level.id)} />)}
            {gold.plan.levels.length === 0 && <div className="empty">No planned levels. Add a buy or sell level.</div>}
          </div>
          <div className="button-row"><button className="secondary" onClick={() => gold.addLevel('Buy')}>+ Add Buy Level</button><button className="secondary" onClick={() => gold.addLevel('Sell')}>+ Add Sell Level</button><button className="secondary push-right" onClick={() => setShowImport(true)}>Paste Plan</button><button className="primary" onClick={save}>Save Plan</button></div>
        </Card>
        <Card title="Price Monitor" eyebrow="Live operational view" action={<div className="toggle-label"><span>Monitoring {gold.monitoring ? 'ON' : 'OFF'}</span><Toggle checked={gold.monitoring} onChange={gold.setMonitoring} label="Master monitoring" /></div>}>
          {!gold.monitoring && <div className="paused">Alerts paused</div>}
          <div className="advanced-level-table">
            <div className="advanced-head"><span>Side</span><span>Entry / Current</span><span>Distance</span><span>Limits</span><span>Status</span><span>Alert</span><span>On</span></div>
            {gold.plan.levels.map((level) => {
              const status = calculateLevelStatus(gold.price, level)
              const percentage = (Math.abs(level.price - gold.price) / gold.price) * 100
              return <div className="advanced-row" key={level.id}>
                <b className={level.direction === 'Buy' ? 'buy' : 'sell'}>{level.direction}</b>
                <span><strong>{formatPrice(level.price, gold.config.priceDecimals)}</strong><small>Now {formatPrice(gold.price, gold.config.priceDecimals)}</small></span>
                <span><strong>{formatDistance(level.price - gold.price, gold.config.priceDecimals)}</strong><small>{percentage.toFixed(3)}%</small></span>
                <span><strong>{formatPrice(level.approachDistance, gold.config.priceDecimals)} app.</strong><small>{formatPrice(level.entryTolerance, gold.config.priceDecimals)} tol.</small></span>
                <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
                <StatusBadge tone={level.alertSent ? 'positive' : 'neutral'}>{level.alertSent ? 'SENT' : 'READY'}</StatusBadge>
                <Toggle checked={level.enabled} onChange={(enabled) => gold.updateLevel(level.id, { enabled })} label={`Monitor ${level.direction} ${level.price}`} />
              </div>
            })}
          </div>
        </Card>
      </div>
      {showImport && <DailyPlanImportModal instrument={gold.config} onClose={() => setShowImport(false)} onApply={applyImport} />}
    </>
  )
}

export function InstrumentManipulationWorkspace() {
  const gold = useInstrumentWorkspace()
  const data = gold.manipulation
  const range = data.firstCandleHigh - data.firstCandleLow
  const { percentage, classification } = calculateManipulationClassification(data)
  const detected = percentage >= 20
  const rangeIncrement = Math.max(gold.config.defaultApproachDistance, gold.config.priceStep)
  const commentary = !data.candleComplete
    ? `The first ${data.session} M15 candle is still forming. Continue waiting.`
    : `${detected ? `The first ${data.session} M15 candle is ${percentage.toFixed(1)}% of daily ATR and is classified as ${classification} manipulation.` : `The first ${data.session} M15 candle is only ${percentage.toFixed(1)}% of daily ATR, below the manipulation threshold.`} ${data.breakoutDirection ? `Price has broken ${data.breakoutDirection === 'Down' ? 'below' : 'above'} the candle range${data.reclaimed ? ' and reclaimed it. Watch the lower timeframe.' : ' but has not reclaimed it. Continue waiting.'}` : 'Price has not broken the candle range.'}`
  const adjustRange = (amount: number) => gold.updateManipulation({
    firstCandleHigh: Number((data.firstCandleHigh + amount / 2).toFixed(gold.config.priceDecimals)),
    firstCandleLow: Number((data.firstCandleLow - amount / 2).toFixed(gold.config.priceDecimals)),
    breakoutDirection: null, reclaimed: false, state: 'Waiting for range break',
  })

  return (
    <div className="strategy-workspace">
      <section className="process-panel">
        <div><span>Manipulation state · Mock</span><h2>{data.state}</h2><p>{detected ? `${classification} manipulation candidate` : 'No valid manipulation range'}</p></div>
        <div className="inline-controls"><button className="secondary" onClick={() => adjustRange(-rangeIncrement)}>Range −{rangeIncrement}</button><button className="secondary" onClick={() => adjustRange(rangeIncrement)}>Range +{rangeIncrement}</button><button className="secondary" onClick={gold.resetManipulation}>Reset</button></div>
      </section>
      <div className="orb-detail-grid">
        <Card title="First M15 Candle" eyebrow={`${data.session} session`}>
          <div className="context-grid orb-context">
            {[['Session', data.session], ['Candle high', formatPrice(data.firstCandleHigh, gold.config.priceDecimals)], ['Candle low', formatPrice(data.firstCandleLow, gold.config.priceDecimals)], ['Candle range', formatPrice(range, gold.config.priceDecimals)], ['Daily ATR', formatPrice(data.dailyAtr, gold.config.priceDecimals)], ['Range / ATR', `${percentage.toFixed(1)}%`], ['Classification', classification], ['Breakout', data.breakoutDirection ?? 'None'], ['Reclaim', data.reclaimed ? 'Confirmed' : 'Waiting'], ['Next action', data.reclaimed ? 'Watch M1' : 'Continue waiting']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
          <div className="mock-inputs"><label>Candle high<input type="number" step={gold.config.priceStep} value={data.firstCandleHigh} onChange={(e) => gold.updateManipulation({ firstCandleHigh: Number(e.target.value), breakoutDirection: null, reclaimed: false })} /></label><label>Candle low<input type="number" step={gold.config.priceStep} value={data.firstCandleLow} onChange={(e) => gold.updateManipulation({ firstCandleLow: Number(e.target.value), breakoutDirection: null, reclaimed: false })} /></label></div>
        </Card>
        <Card title="Automatic Commentary" eyebrow="Strategy interpretation">
          <div className="commentary-panel"><StatusBadge tone={detected ? 'warning' : 'neutral'}>{classification}</StatusBadge><p>{commentary}</p><small>Mock candle values only. No live candle feed is connected.</small></div>
        </Card>
      </div>
    </div>
  )
}

export function InstrumentStructureWorkspace() {
  const gold = useInstrumentWorkspace()
  const structure = gold.structure
  const nearest = calculateNearestSupportResistance(gold.price, structure.zones)
  const distanceTo = (zone: typeof nearest.support) => zone ? Math.min(Math.abs(gold.price - zone.lowerPrice), Math.abs(gold.price - zone.upperPrice)) : null
  const field = (key: keyof Omit<typeof structure, 'zones' | 'dailyBias'>, label: string) => <label>{label}<input type="number" step={gold.config.priceStep} value={structure[key] as number} onChange={(e) => gold.updateStructure({ [key]: Number(e.target.value) })} /></label>

  return (
    <div className="structure-workspace">
      <Card title="Daily Structure" eyebrow="Manual context">
        <div className="plan-settings structure-settings">
          <label>Daily bias<select value={structure.dailyBias} onChange={(e) => gold.updateStructure({ dailyBias: e.target.value as Bias })}><option>Bullish</option><option>Bearish</option><option>Neutral</option></select></label>
          {field('dailyEma200', 'Daily 200 EMA')}{field('previousDayHigh', 'Previous day high')}{field('previousDayLow', 'Previous day low')}{field('recentSwingHigh', 'Recent swing high')}{field('recentSwingLow', 'Recent swing low')}
        </div>
        <div className="structure-summary">
          <div><span>Price vs 200 EMA</span><strong>{gold.price >= structure.dailyEma200 ? 'Above' : 'Below'} by {formatDistance(gold.price - structure.dailyEma200, gold.config.priceDecimals)}</strong></div>
          <div><span>Nearest support</span><strong>{nearest.support?.label ?? 'None'} · {distanceTo(nearest.support)?.toFixed(gold.config.priceDecimals) ?? '—'}</strong></div>
          <div><span>Nearest resistance</span><strong>{nearest.resistance?.label ?? 'None'} · {distanceTo(nearest.resistance)?.toFixed(gold.config.priceDecimals) ?? '—'}</strong></div>
          <div><span>Current location</span><strong>{nearest.inside ? `Inside ${nearest.inside.label}` : 'Outside configured zones'}</strong></div>
        </div>
      </Card>
      <Card title="Support & Resistance Zones" eyebrow="Manual zones" action={<button className="primary" onClick={gold.addZone}>+ Add Zone</button>}>
        <div className="zone-list">
          {structure.zones.map((zone) => <div className="zone-editor" key={zone.id}>
            <input aria-label="Zone label" value={zone.label} onChange={(e) => gold.updateZone(zone.id, { label: e.target.value })} />
            <select aria-label="Zone type" value={zone.type} onChange={(e) => gold.updateZone(zone.id, { type: e.target.value as typeof zone.type })}><option>Support</option><option>Resistance</option></select>
            <select aria-label="Zone timeframe" value={zone.timeframe} onChange={(e) => gold.updateZone(zone.id, { timeframe: e.target.value as typeof zone.timeframe })}><option>Daily</option><option>4H</option></select>
            <input aria-label="Zone lower price" type="number" step={gold.config.priceStep} value={zone.lowerPrice} onChange={(e) => gold.updateZone(zone.id, { lowerPrice: Number(e.target.value) })} />
            <input aria-label="Zone upper price" type="number" step={gold.config.priceStep} value={zone.upperPrice} onChange={(e) => gold.updateZone(zone.id, { upperPrice: Number(e.target.value) })} />
            <input aria-label="Zone notes" value={zone.notes} placeholder="Notes" onChange={(e) => gold.updateZone(zone.id, { notes: e.target.value })} />
            <Toggle checked={zone.enabled} onChange={(enabled) => gold.updateZone(zone.id, { enabled })} label={`Enable ${zone.label}`} />
            <button className="icon-button danger" onClick={() => gold.removeZone(zone.id)} aria-label={`Delete ${zone.label}`}>×</button>
          </div>)}
        </div>
      </Card>
    </div>
  )
}

export function InstrumentHistoryWorkspace() {
  const gold = useInstrumentWorkspace()
  const [filter, setFilter] = useState<'ALL' | ActivityCategory>('ALL')
  const events = useMemo(() => filter === 'ALL' ? gold.history : gold.history.filter((event) => event.category === filter), [filter, gold.history])
  const exportHistory = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(gold.history, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `${gold.config.symbol.toLowerCase()}-activity-history.json`; link.click(); URL.revokeObjectURL(url)
  }
  return (
    <Card title={`${gold.config.symbol} Activity History`} eyebrow="Local instrument journal" action={<div className="history-actions"><select aria-label="Filter history category" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="ALL">All categories</option>{['PLAN', 'LEVEL', 'ALERT', 'ORB', 'MANIPULATION', 'STRUCTURE', 'MONITORING', 'SYSTEM'].map((category) => <option key={category}>{category}</option>)}</select><button className="secondary" onClick={exportHistory}>Export JSON</button><button className="secondary danger-text" onClick={gold.clearHistory}>Clear</button></div>}>
      <div className="history-table">
        <div className="history-head"><span>Date</span><span>Time</span><span>Category</span><span>Event</span><span>Price</span><span>Status</span></div>
        {events.map((event) => { const date = new Date(event.timestamp); return <div className="history-row" key={event.id}><span>{date.toLocaleDateString()}</span><span>{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><StatusBadge>{event.category}</StatusBadge><strong>{event.event}</strong><span>{event.price === null ? '—' : formatPrice(event.price, gold.config.priceDecimals)}</span><StatusBadge tone={statusTone(event.status)}>{event.status}</StatusBadge></div> })}
        {events.length === 0 && <div className="empty">No activity has been recorded for this filter.</div>}
      </div>
    </Card>
  )
}

