import { useEffect, useMemo, useState } from 'react'
import { useGold } from '../context/GoldContext'
import type { ActivityCategory, Bias, GoldTab, Instrument, PlannedLevel } from '../types'
import {
  calculateGoldStatus, calculateLevelStatus,
  calculateManipulationClassification, calculateNearestLevel,
  calculateNearestSupportResistance, calculateNextAction, formatDistance,
  formatPrice, statusTone,
} from '../utils/trading'
import { Card, Toggle } from './Cards'
import { StatusBadge } from './Chrome'

export function InstrumentSummaryCard({ instrument, onOpen }: { instrument: Instrument; onOpen?: () => void }) {
  return (
    <article className={`instrument-card status-${statusTone(instrument.status)}`} onClick={onOpen}>
      <div className="instrument-card-head">
        <div><span>{instrument.name}</span><h2>{instrument.symbol}</h2></div>
        <StatusBadge tone={statusTone(instrument.status)}>{instrument.status}</StatusBadge>
      </div>
      <div className="instrument-priority">
        <span>Next event</span>
        <strong>{instrument.nextEvent}</strong>
      </div>
      <div className="instrument-meta">
        <div><span>Bias</span><b>{instrument.bias}</b></div>
        <div><span>Session</span><b>{instrument.session}</b></div>
        <div><span>Price</span><b>{formatPrice(instrument.price, instrument.symbol === 'EURUSD' ? 4 : 2)}</b></div>
        <div><span>Today</span><b className={instrument.dailyChange >= 0 ? 'positive-text' : 'danger-text'}>{instrument.dailyChange >= 0 ? '+' : ''}{instrument.dailyChange.toFixed(2)}%</b></div>
      </div>
      <div className="strategy-lines">
        {instrument.strategies.map((strategy) => <div key={strategy.name}><span>{strategy.name}</span><strong>{strategy.status}</strong></div>)}
      </div>
      <button className="open-instrument" disabled={!onOpen} onClick={(event) => { event.stopPropagation(); onOpen?.() }}>
        {onOpen ? 'Open Instrument' : 'Workspace not configured'}
      </button>
    </article>
  )
}

export function GoldOverview({ onTab }: { onTab: (tab: GoldTab) => void }) {
  const gold = useGold()
  const nearest = calculateNearestLevel(gold.price, gold.plan.levels)
  const status = calculateGoldStatus(gold.monitoring, true, nearest, gold.price)
  const next = calculateNextAction(gold.monitoring, true, nearest, gold.price, gold.orb, gold.manipulation)
  const distance = nearest ? Math.abs(nearest.price - gold.price) : null
  const orbDistance = Math.min(Math.abs(gold.price - gold.orb.high), Math.abs(gold.price - gold.orb.low))
  const manipulation = calculateManipulationClassification(gold.manipulation)
  const levelStatus = nearest ? calculateLevelStatus(gold.price, nearest) : 'DISABLED'
  const reason = !gold.monitoring
    ? 'Price monitoring is switched off.'
    : nearest
      ? `Price is ${formatDistance(nearest.price - gold.price)} from today’s ${nearest.direction.toLowerCase()} level at ${formatPrice(nearest.price)}.`
      : 'No enabled daily-plan level is available.'

  const conditions = [
    ['Session active', true, 'London open'],
    ['Daily plan loaded', gold.plan.levels.length > 0, `${gold.plan.levels.length} levels`],
    ['Monitoring enabled', gold.monitoring, gold.monitoring ? 'On' : 'Off'],
    ['Price near a level', levelStatus === 'APPROACHING' || levelStatus === 'ALERT SENT' || levelStatus === 'IN ZONE', levelStatus],
    ['Opening range complete', gold.orb.rangeComplete, gold.orb.rangeComplete ? 'Complete' : 'Building'],
    ['Breakout detected', Boolean(gold.orb.breakoutDirection), gold.orb.breakoutDirection ?? 'None'],
    ['Manipulation detected', manipulation.percentage >= 20, manipulation.classification],
    ['Alert already sent', Boolean(nearest?.alertSent), nearest?.alertSent ? 'Sent' : 'No'],
  ] as const

  return (
    <div className="gold-overview-layout">
      <section className={`primary-status status-${statusTone(status)}`}>
        <div className="primary-status-top"><span>Primary status · London open</span><StatusBadge tone={statusTone(status)}>{status}</StatusBadge></div>
        <div className="primary-status-main">
          <div><small>Current price</small><strong>{formatPrice(gold.price)}</strong></div>
          <div><small>Nearest level</small><strong>{nearest ? formatPrice(nearest.price) : '—'}</strong></div>
          <div><small>Distance</small><strong>{distance === null ? '—' : formatPrice(distance)}</strong></div>
        </div>
        <p>{reason}</p>
        <div className="status-next"><span>NEXT</span><strong>{next.detail}</strong></div>
        <small className="status-updated">Updated {new Date(gold.lastStatusUpdate).toLocaleTimeString()}</small>
      </section>

      <Card title="Next Action" eyebrow="Operational instruction" className="next-action-card" action={<StatusBadge tone={statusTone(status)}>{next.action}</StatusBadge>}>
        <div className="next-action-content"><strong>{next.action}</strong><p>{next.detail}</p></div>
      </Card>

      <div className="strategy-summary-grid">
        <button className="strategy-panel" onClick={() => onTab('plan')}>
          <span>Daily Plan</span><StatusBadge tone={statusTone(levelStatus)}>{levelStatus}</StatusBadge>
          <strong>{nearest ? `${nearest.direction} ${formatPrice(nearest.price)}` : 'No level'}</strong>
          <p>{distance === null ? 'No distance' : `${formatPrice(distance)} away`} · Monitoring {gold.monitoring ? 'on' : 'off'}</p><small>Open Daily Plan →</small>
        </button>
        <button className="strategy-panel" onClick={() => onTab('orb')}>
          <span>ORB</span><StatusBadge tone={statusTone(gold.orb.state)}>{gold.orb.state}</StatusBadge>
          <strong>{gold.orb.rangeComplete ? 'Opening range complete' : 'Range building'}</strong>
          <p>{formatPrice(orbDistance)} to nearest boundary · Breakout {gold.orb.breakoutDirection ?? 'none'}</p><small>Open ORB →</small>
        </button>
        <button className="strategy-panel" onClick={() => onTab('manipulation')}>
          <span>Manipulation</span><StatusBadge tone={manipulation.percentage >= 20 ? 'warning' : 'neutral'}>{manipulation.classification}</StatusBadge>
          <strong>{gold.manipulation.state}</strong>
          <p>{manipulation.percentage.toFixed(1)}% of ATR · Reclaim {gold.manipulation.reclaimed ? 'confirmed' : 'waiting'}</p><small>Open Manipulation →</small>
        </button>
      </div>

      <Card title="Automatic Conditions" eyebrow="Live decision inputs">
        <div className="conditions-grid">{conditions.map(([label, yes, detail]) => <div key={label}><i className={yes ? 'yes' : 'no'}>{yes ? '✓' : '—'}</i><span>{label}<small>{detail}</small></span></div>)}</div>
      </Card>

      <Card title="Market Context" eyebrow="Compact session data">
        <div className="context-grid">
          {[['Price', formatPrice(gold.price)], ['Daily bias', gold.plan.bias], ['Daily range', '25.20'], ['Daily ATR', '42.80'], ['Session', 'London'], ['Time remaining', '02:12']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
      </Card>
    </div>
  )
}

const orbProgress = [
  'Waiting for session', 'Building opening candle', 'Opening range complete', 'Waiting for breakout',
  'Breakout detected', 'Waiting for confirmation', 'Setup active', 'Finished',
]

export function OrbWorkspace() {
  const gold = useGold()
  const orb = gold.orb
  const range = orb.high - orb.low
  const percentage = (range / orb.dailyAtr) * 100
  const inside = gold.price >= orb.low && gold.price <= orb.high
  const highDistance = Math.abs(orb.high - gold.price)
  const lowDistance = Math.abs(gold.price - orb.low)
  const nearest = highDistance < lowDistance ? 'OR High' : 'OR Low'
  const position = Math.max(0, Math.min(100, ((gold.price - orb.low) / range) * 100))
  const commentary = `The London opening range is ${orb.rangeComplete ? 'complete' : 'still building'}. The range is ${formatPrice(range)}, which is ${percentage.toFixed(1)}% of daily ATR. Price is currently ${inside ? 'inside' : 'outside'} the range and ${formatPrice(Math.min(highDistance, lowDistance))} from the ${nearest}. ${orb.breakoutDirection ? `A mock ${orb.breakoutDirection.toLowerCase()} breakout is awaiting candle-close confirmation.` : 'No breakout has been confirmed.'}`
  const currentIndex = orbProgress.indexOf(orb.state)

  return (
    <div className="strategy-workspace">
      <section className="process-panel">
        <div><span>Current ORB state · Mock</span><h2>{orb.state}</h2><p>Candle-close confirmation is required before a setup becomes active.</p></div>
        <button className="secondary" onClick={gold.resetOrb}>Reset ORB mock state</button>
      </section>
      <div className="process-steps">{orbProgress.map((step, index) => <div className={index === currentIndex ? 'active' : index < currentIndex ? 'done' : ''} key={step}><i>{index + 1}</i><span>{step}</span></div>)}</div>
      <div className="orb-detail-grid">
        <Card title="Opening Range" eyebrow="London mock data">
          <div className="context-grid orb-context">
            {[['OR High', formatPrice(orb.high)], ['OR Low', formatPrice(orb.low)], ['Range', formatPrice(range)], ['% of ATR', `${percentage.toFixed(1)}%`], ['To OR High', formatPrice(highDistance)], ['To OR Low', formatPrice(lowDistance)], ['Nearest boundary', nearest], ['Location', inside ? 'Inside range' : 'Outside range'], ['Breakout', orb.breakoutDirection ?? 'None'], ['Timestamp', orb.breakoutTimestamp ? new Date(orb.breakoutTimestamp).toLocaleTimeString() : '—']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
          <div className="range-chart">
            <div className="range-labels"><span>OR LOW <b>{formatPrice(orb.low)}</b></span><span>OR HIGH <b>{formatPrice(orb.high)}</b></span></div>
            <div className="range-line"><span className="price-pin" style={{ left: `${position}%` }}><i />{formatPrice(gold.price)}</span></div>
          </div>
        </Card>
        <Card title="Automatic Commentary" eyebrow="Live strategy interpretation">
          <div className="commentary-panel"><StatusBadge tone={inside ? 'neutral' : 'warning'}>{inside ? 'Inside range' : 'Mock breakout'}</StatusBadge><p>{commentary}</p><small>Mock data only. Actual candle-close data is not connected.</small></div>
        </Card>
      </div>
    </div>
  )
}

function LevelEditorRow({ level, onChange, onDelete }: { level: PlannedLevel; onChange: (patch: Partial<PlannedLevel>) => void; onDelete: () => void }) {
  return (
    <div className="level-editor-row">
      <select aria-label="Level direction" value={level.direction} onChange={(e) => onChange({ direction: e.target.value as PlannedLevel['direction'] })}><option>Buy</option><option>Sell</option></select>
      <input aria-label="Level price" type="number" step="0.1" value={level.price} onChange={(e) => onChange({ price: Number(e.target.value), alertSent: false })} />
      <Toggle checked={level.enabled} onChange={(enabled) => onChange({ enabled })} label={`Enable ${level.direction} level`} />
      <button className="icon-button danger" onClick={onDelete} aria-label={`Delete ${level.direction} level`}>×</button>
    </div>
  )
}

export function DailyPlanWorkspace() {
  const gold = useGold()
  const [bias, setBias] = useState(gold.plan.bias)
  const [approach, setApproach] = useState(gold.plan.approachDistance)
  const [tolerance, setTolerance] = useState(gold.plan.entryTolerance)
  useEffect(() => { setBias(gold.plan.bias); setApproach(gold.plan.approachDistance); setTolerance(gold.plan.entryTolerance) }, [gold.plan.bias, gold.plan.approachDistance, gold.plan.entryTolerance])

  const save = () => gold.savePlan({
    ...gold.plan, bias, approachDistance: approach, entryTolerance: tolerance,
    levels: gold.plan.levels.map((level) => ({ ...level, approachDistance: approach, entryTolerance: tolerance })),
    lastSaved: new Date().toISOString(),
  })

  return (
    <div className="plan-workspace">
      <Card title="Plan Editor" eyebrow="Set once before session">
        <div className="plan-settings">
          <label>Daily bias<select value={bias} onChange={(e) => setBias(e.target.value as Bias)}><option>Bullish</option><option>Bearish</option><option>Neutral</option></select></label>
          <label>Approach distance<input type="number" min=".1" step=".1" value={approach} onChange={(e) => setApproach(Number(e.target.value))} /></label>
          <label>Entry tolerance<input type="number" min=".01" step=".05" value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} /></label>
        </div>
        <div className="level-editor-list">
          <div className="editor-labels"><span>Direction</span><span>Entry level</span><span>Enabled</span><span /></div>
          {gold.plan.levels.map((level) => <LevelEditorRow key={level.id} level={level} onChange={(patch) => gold.updateLevel(level.id, patch)} onDelete={() => gold.removeLevel(level.id)} />)}
          {gold.plan.levels.length === 0 && <div className="empty">No planned levels. Add a buy or sell level.</div>}
        </div>
        <div className="button-row"><button className="secondary" onClick={() => gold.addLevel('Buy')}>+ Add Buy Level</button><button className="secondary" onClick={() => gold.addLevel('Sell')}>+ Add Sell Level</button><button className="primary push-right" onClick={save}>Save Plan</button></div>
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
              <span><strong>{formatPrice(level.price)}</strong><small>Now {formatPrice(gold.price)}</small></span>
              <span><strong>{formatDistance(level.price - gold.price)}</strong><small>{percentage.toFixed(3)}%</small></span>
              <span><strong>{formatPrice(level.approachDistance)} app.</strong><small>{formatPrice(level.entryTolerance)} tol.</small></span>
              <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
              <StatusBadge tone={level.alertSent ? 'positive' : 'neutral'}>{level.alertSent ? 'SENT' : 'READY'}</StatusBadge>
              <Toggle checked={level.enabled} onChange={(enabled) => gold.updateLevel(level.id, { enabled })} label={`Monitor ${level.direction} ${level.price}`} />
            </div>
          })}
        </div>
      </Card>
    </div>
  )
}

export function ManipulationWorkspace() {
  const gold = useGold()
  const data = gold.manipulation
  const range = data.firstCandleHigh - data.firstCandleLow
  const { percentage, classification } = calculateManipulationClassification(data)
  const detected = percentage >= 20
  const commentary = !data.candleComplete
    ? 'The first London M15 candle is still forming. Continue waiting.'
    : `${detected ? `The first London M15 candle is ${percentage.toFixed(1)}% of daily ATR and is classified as ${classification} manipulation.` : `The first London M15 candle is only ${percentage.toFixed(1)}% of daily ATR, below the manipulation threshold.`} ${data.breakoutDirection ? `Price has broken ${data.breakoutDirection === 'Down' ? 'below' : 'above'} the candle range${data.reclaimed ? ' and reclaimed it. Watch the lower timeframe.' : ' but has not reclaimed it. Continue waiting.'}` : 'Price has not broken the candle range.'}`
  const adjustRange = (amount: number) => gold.updateManipulation({
    firstCandleHigh: Number((data.firstCandleHigh + amount / 2).toFixed(2)),
    firstCandleLow: Number((data.firstCandleLow - amount / 2).toFixed(2)),
    breakoutDirection: null, reclaimed: false, state: 'Waiting for range break',
  })

  return (
    <div className="strategy-workspace">
      <section className="process-panel">
        <div><span>Manipulation state · Mock</span><h2>{data.state}</h2><p>{detected ? `${classification} manipulation candidate` : 'No valid manipulation range'}</p></div>
        <div className="inline-controls"><button className="secondary" onClick={() => adjustRange(-2)}>Range −2</button><button className="secondary" onClick={() => adjustRange(2)}>Range +2</button><button className="secondary" onClick={gold.resetManipulation}>Reset</button></div>
      </section>
      <div className="orb-detail-grid">
        <Card title="First M15 Candle" eyebrow="London session">
          <div className="context-grid orb-context">
            {[['Session', data.session], ['Candle high', formatPrice(data.firstCandleHigh)], ['Candle low', formatPrice(data.firstCandleLow)], ['Candle range', formatPrice(range)], ['Daily ATR', formatPrice(data.dailyAtr)], ['Range / ATR', `${percentage.toFixed(1)}%`], ['Classification', classification], ['Breakout', data.breakoutDirection ?? 'None'], ['Reclaim', data.reclaimed ? 'Confirmed' : 'Waiting'], ['Next action', data.reclaimed ? 'Watch M1' : 'Continue waiting']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
          <div className="mock-inputs"><label>Candle high<input type="number" step=".1" value={data.firstCandleHigh} onChange={(e) => gold.updateManipulation({ firstCandleHigh: Number(e.target.value), breakoutDirection: null, reclaimed: false })} /></label><label>Candle low<input type="number" step=".1" value={data.firstCandleLow} onChange={(e) => gold.updateManipulation({ firstCandleLow: Number(e.target.value), breakoutDirection: null, reclaimed: false })} /></label></div>
        </Card>
        <Card title="Automatic Commentary" eyebrow="Strategy interpretation">
          <div className="commentary-panel"><StatusBadge tone={detected ? 'warning' : 'neutral'}>{classification}</StatusBadge><p>{commentary}</p><small>Mock candle values only. No live candle feed is connected.</small></div>
        </Card>
      </div>
    </div>
  )
}

export function StructureWorkspace() {
  const gold = useGold()
  const structure = gold.structure
  const nearest = calculateNearestSupportResistance(gold.price, structure.zones)
  const distanceTo = (zone: typeof nearest.support) => zone ? Math.min(Math.abs(gold.price - zone.lowerPrice), Math.abs(gold.price - zone.upperPrice)) : null
  const field = (key: keyof Omit<typeof structure, 'zones' | 'dailyBias'>, label: string) => <label>{label}<input type="number" step=".1" value={structure[key] as number} onChange={(e) => gold.updateStructure({ [key]: Number(e.target.value) })} /></label>

  return (
    <div className="structure-workspace">
      <Card title="Daily Structure" eyebrow="Manual context">
        <div className="plan-settings structure-settings">
          <label>Daily bias<select value={structure.dailyBias} onChange={(e) => gold.updateStructure({ dailyBias: e.target.value as Bias })}><option>Bullish</option><option>Bearish</option><option>Neutral</option></select></label>
          {field('dailyEma200', 'Daily 200 EMA')}{field('previousDayHigh', 'Previous day high')}{field('previousDayLow', 'Previous day low')}{field('recentSwingHigh', 'Recent swing high')}{field('recentSwingLow', 'Recent swing low')}
        </div>
        <div className="structure-summary">
          <div><span>Price vs 200 EMA</span><strong>{gold.price >= structure.dailyEma200 ? 'Above' : 'Below'} by {formatDistance(gold.price - structure.dailyEma200)}</strong></div>
          <div><span>Nearest support</span><strong>{nearest.support?.label ?? 'None'} · {distanceTo(nearest.support)?.toFixed(2) ?? '—'}</strong></div>
          <div><span>Nearest resistance</span><strong>{nearest.resistance?.label ?? 'None'} · {distanceTo(nearest.resistance)?.toFixed(2) ?? '—'}</strong></div>
          <div><span>Current location</span><strong>{nearest.inside ? `Inside ${nearest.inside.label}` : 'Outside configured zones'}</strong></div>
        </div>
      </Card>
      <Card title="Support & Resistance Zones" eyebrow="Manual zones" action={<button className="primary" onClick={gold.addZone}>+ Add Zone</button>}>
        <div className="zone-list">
          {structure.zones.map((zone) => <div className="zone-editor" key={zone.id}>
            <input aria-label="Zone label" value={zone.label} onChange={(e) => gold.updateZone(zone.id, { label: e.target.value })} />
            <select aria-label="Zone type" value={zone.type} onChange={(e) => gold.updateZone(zone.id, { type: e.target.value as typeof zone.type })}><option>Support</option><option>Resistance</option></select>
            <select aria-label="Zone timeframe" value={zone.timeframe} onChange={(e) => gold.updateZone(zone.id, { timeframe: e.target.value as typeof zone.timeframe })}><option>Daily</option><option>4H</option></select>
            <input aria-label="Zone lower price" type="number" step=".1" value={zone.lowerPrice} onChange={(e) => gold.updateZone(zone.id, { lowerPrice: Number(e.target.value) })} />
            <input aria-label="Zone upper price" type="number" step=".1" value={zone.upperPrice} onChange={(e) => gold.updateZone(zone.id, { upperPrice: Number(e.target.value) })} />
            <input aria-label="Zone notes" value={zone.notes} placeholder="Notes" onChange={(e) => gold.updateZone(zone.id, { notes: e.target.value })} />
            <Toggle checked={zone.enabled} onChange={(enabled) => gold.updateZone(zone.id, { enabled })} label={`Enable ${zone.label}`} />
            <button className="icon-button danger" onClick={() => gold.removeZone(zone.id)} aria-label={`Delete ${zone.label}`}>×</button>
          </div>)}
        </div>
      </Card>
    </div>
  )
}

export function HistoryWorkspace() {
  const gold = useGold()
  const [filter, setFilter] = useState<'ALL' | ActivityCategory>('ALL')
  const events = useMemo(() => filter === 'ALL' ? gold.history : gold.history.filter((event) => event.category === filter), [filter, gold.history])
  const exportHistory = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(gold.history, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = 'gold-activity-history.json'; link.click(); URL.revokeObjectURL(url)
  }
  return (
    <Card title="Gold Activity History" eyebrow="Local instrument journal" action={<div className="history-actions"><select aria-label="Filter history category" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="ALL">All categories</option>{['PLAN', 'LEVEL', 'ALERT', 'ORB', 'MANIPULATION', 'STRUCTURE', 'MONITORING', 'SYSTEM'].map((category) => <option key={category}>{category}</option>)}</select><button className="secondary" onClick={exportHistory}>Export JSON</button><button className="secondary danger-text" onClick={gold.clearHistory}>Clear</button></div>}>
      <div className="history-table">
        <div className="history-head"><span>Date</span><span>Time</span><span>Category</span><span>Event</span><span>Price</span><span>Status</span></div>
        {events.map((event) => { const date = new Date(event.timestamp); return <div className="history-row" key={event.id}><span>{date.toLocaleDateString()}</span><span>{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><StatusBadge>{event.category}</StatusBadge><strong>{event.event}</strong><span>{event.price === null ? '—' : formatPrice(event.price)}</span><StatusBadge tone={statusTone(event.status)}>{event.status}</StatusBadge></div> })}
        {events.length === 0 && <div className="empty">No activity has been recorded for this filter.</div>}
      </div>
    </Card>
  )
}

