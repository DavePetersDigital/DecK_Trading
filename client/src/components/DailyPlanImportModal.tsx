import { useEffect, useState } from 'react'
import type { Bias, Direction, InstrumentConfiguration } from '../types'
import type { ParsedDailyPlan, ParsedDailyPlanLevel, PlanImportMode } from '../types/dailyPlanImport'
import { isInstrumentMatch, parseDailyPlanText } from '../utils/dailyPlanParser'

interface DailyPlanImportModalProps {
  onClose: () => void
  onApply: (plan: ParsedDailyPlan, mode: PlanImportMode) => void
  instrument: InstrumentConfiguration
}

function optionalNumber(value: string) {
  if (value.trim() === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

export function DailyPlanImportModal({ onClose, onApply, instrument }: DailyPlanImportModalProps) {
  const [source, setSource] = useState('')
  const [parsed, setParsed] = useState<ParsedDailyPlan | null>(null)
  const [mode, setMode] = useState<PlanImportMode>('Replace')
  const [confirmMismatch, setConfirmMismatch] = useState(false)

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const parse = () => {
    if (!source.trim()) return
    setParsed(parseDailyPlanText(source))
    setConfirmMismatch(false)
  }
  const patch = (change: Partial<ParsedDailyPlan>) => setParsed((current) => current ? { ...current, ...change } : current)
  const updateLevel = (index: number, change: Partial<ParsedDailyPlanLevel>) => {
    if (!parsed) return
    const levels = parsed.levels.map((level, levelIndex) => levelIndex === index ? { ...level, ...change } : level)
    patch({
      levels,
      warnings: levels.some((level) => level.price > 0)
        ? parsed.warnings.filter((warning) => warning !== 'No valid labelled buy or sell levels were detected.')
        : parsed.warnings,
    })
  }
  const addLevel = (direction: Direction) => {
    if (!parsed) return
    patch({
      levels: [...parsed.levels, { direction, price: 0, sourceText: 'Added in preview', confidence: 'high' }],
    })
  }
  const mismatch = Boolean(parsed?.instrument && !isInstrumentMatch(parsed.instrument, instrument))
  const validLevels = parsed?.levels.filter((level) => Number.isFinite(level.price) && level.price > 0) ?? []
  const canApply = validLevels.length > 0 && (!mismatch || confirmMismatch)

  return (
    <div className="plan-import-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="plan-import-modal" role="dialog" aria-modal="true" aria-labelledby="plan-import-title">
        <header>
          <div><span>Local rule-based import</span><h2 id="plan-import-title">Paste Daily Plan</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close paste plan">×</button>
        </header>

        {!parsed ? (
          <div className="plan-import-paste">
            <label htmlFor="daily-plan-source">Paste plain-text plan</label>
            <textarea
              id="daily-plan-source"
              autoFocus
              value={source}
              onChange={(event) => setSource(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  parse()
                }
              }}
              placeholder={`Instrument: ${instrument.symbol}\nBias: Neutral\nSell: 100\nBuy: 95\nApproach distance: ${instrument.defaultApproachDistance}\nEntry tolerance: ${instrument.defaultEntryTolerance}`}
            />
            <small>Runs locally. Press Ctrl/Cmd + Enter to parse.</small>
            <div className="plan-import-actions">
              <button className="secondary" onClick={() => setSource('')} disabled={!source}>Clear</button>
              <button className="secondary" onClick={onClose}>Cancel</button>
              <button className="primary" onClick={parse} disabled={!source.trim()}>Parse Plan</button>
            </div>
          </div>
        ) : (
          <div className="plan-import-preview">
            {mismatch && (
              <div className="import-message import-message--danger">
                <strong>Instrument mismatch</strong>
                <span>This text names {parsed.instrument}. You are importing into the {instrument.shortName} / {instrument.symbol} workspace.</span>
              </div>
            )}

            <div className="import-preview-grid">
              <label>Instrument<input value={parsed.instrument ?? ''} placeholder="Not detected" onChange={(event) => patch({ instrument: event.target.value || undefined })} /></label>
              <label>Daily bias<select value={parsed.bias ?? ''} onChange={(event) => patch({ bias: (event.target.value || undefined) as Bias | undefined })}><option value="">Keep current bias</option><option>Bullish</option><option>Bearish</option><option>Neutral</option></select></label>
              <label>Approach distance<input type="number" min="0" step=".1" value={parsed.approachDistance ?? ''} placeholder="Keep current" onChange={(event) => patch({ approachDistance: optionalNumber(event.target.value) })} /></label>
              <label>Entry tolerance<input type="number" min="0" step=".01" value={parsed.entryTolerance ?? ''} placeholder="Keep current" onChange={(event) => patch({ entryTolerance: optionalNumber(event.target.value) })} /></label>
              <label className="preview-wide">Date / session label<input value={parsed.dateSessionLabel ?? ''} placeholder="Optional" onChange={(event) => patch({ dateSessionLabel: event.target.value || undefined })} /></label>
              <label className="preview-wide">Notes<textarea value={parsed.notes ?? ''} placeholder="Optional notes" onChange={(event) => patch({ notes: event.target.value || undefined })} /></label>
            </div>

            <div className="import-levels">
              <div className="import-section-head">
                <div><strong>Detected levels</strong><span>{validLevels.length} valid</span></div>
                <div><button className="secondary" onClick={() => addLevel('Buy')}>+ Buy</button><button className="secondary" onClick={() => addLevel('Sell')}>+ Sell</button></div>
              </div>
              {parsed.levels.map((level, index) => (
                <div className={`import-level-row ${level.price > 0 ? 'valid' : 'invalid'}`} key={`${level.sourceText}-${index}`}>
                  <select aria-label={`Level ${index + 1} direction`} value={level.direction} onChange={(event) => updateLevel(index, { direction: event.target.value as Direction })}><option>Buy</option><option>Sell</option></select>
                  <input aria-label={`Level ${index + 1} price`} type="number" min="0" step={instrument.priceStep} value={level.price} onChange={(event) => updateLevel(index, { price: Number(event.target.value) })} />
                  <span>{level.confidence} confidence{level.warning ? ` · ${level.warning}` : ''}</span>
                  <button className="icon-button danger" onClick={() => patch({ levels: parsed.levels.filter((_, levelIndex) => levelIndex !== index) })} aria-label={`Remove level ${index + 1}`}>×</button>
                </div>
              ))}
              {!parsed.levels.length && <div className="import-empty">No valid labelled levels were detected. Apply is disabled.</div>}
            </div>

            {(parsed.warnings.length > 0 || parsed.unparsedLines.length > 0) && (
              <div className="import-diagnostics">
                {parsed.warnings.length > 0 && <div><strong>Warnings</strong>{parsed.warnings.map((warning, index) => <span className="warning" key={`${warning}-${index}`}>{warning}</span>)}</div>}
                {parsed.unparsedLines.length > 0 && <div><strong>Unparsed lines</strong>{parsed.unparsedLines.map((line, index) => <span className="unparsed" key={`${line}-${index}`}>{line}</span>)}</div>}
              </div>
            )}

            <div className="import-apply-options">
              <span>Apply mode</span>
              <label><input type="radio" name="import-mode" checked={mode === 'Replace'} onChange={() => setMode('Replace')} />Replace existing levels</label>
              <label><input type="radio" name="import-mode" checked={mode === 'Append'} onChange={() => setMode('Append')} />Add to existing levels</label>
              {mismatch && <label className="confirm-mismatch"><input type="checkbox" checked={confirmMismatch} onChange={(event) => setConfirmMismatch(event.target.checked)} />I understand this {parsed.instrument} plan will be applied to {instrument.symbol}</label>}
            </div>

            <div className="plan-import-actions">
              <button className="secondary" onClick={onClose}>Cancel</button>
              <button className="secondary" onClick={() => setParsed(null)}>Parse Again</button>
              <button className="primary" disabled={!canApply} onClick={() => onApply({ ...parsed, levels: validLevels }, mode)}>Apply to Current Plan</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
