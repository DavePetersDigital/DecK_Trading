import type { Bias, Direction, InstrumentConfiguration } from '../types'
import type { ParsedDailyPlan, ParsedDailyPlanLevel } from '../types/dailyPlanImport'

const numberPattern = /[-+]?(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d*\.\d+|\d+)/g
const buyPattern = /\b(buy|long|support|demand)\b/i
const sellPattern = /\b(sell|short|resistance|supply)\b/i
const levelContextPattern = /\b(levels?|zones?|entries?|prices?|support|resistance|supply|demand)\b/i
const biasContextPattern = /\b(daily\s+bias|bias|direction|outlook)\b/i
const approachPattern = /\b(approach(?:\s+distance)?|alert\s+distance)\b/i
const tolerancePattern = /\b(entry\s+)?tolerance\b/i
const notesPattern = /^\s*(notes?|comments?|instructions?)\s*[:=-]?\s*(.*)$/i
const dateSessionPattern = /^\s*(date|session|plan\s+date)\s*[:=-]?\s*(.*)$/i

function cleanLine(line: string) {
  return line.replace(/^\s*(?:[-*•]+\s*|\d+[.)]\s*)/, '').trim()
}

function numbersFrom(line: string) {
  return (line.match(numberPattern) ?? [])
    .map((value) => Number(value.replaceAll(',', '')))
    .filter((value) => Number.isFinite(value))
}

function directionFrom(line: string): Direction | null {
  const buy = buyPattern.test(line)
  const sell = sellPattern.test(line)
  if (buy === sell) return null
  return buy ? 'Buy' : 'Sell'
}

function biasFrom(line: string): Bias | undefined {
  if (/\b(bullish|long|buy)\b/i.test(line)) return 'Bullish'
  if (/\b(bearish|short|sell)\b/i.test(line)) return 'Bearish'
  if (/\bneutral\b/i.test(line)) return 'Neutral'
  return undefined
}

function instrumentFrom(line: string) {
  const compact = line.toUpperCase().replace(/\s+/g, '')
  if (/\bGOLD\b/i.test(line) || compact.includes('XAUUSD') || compact.includes('XAU/USD')) return 'XAUUSD'
  const known = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'EURJPY', 'GBPJPY', 'NAS100', 'SPX500', 'GER40', 'BTCUSD']
    .find((symbol) => compact.includes(symbol))
  if (known) return known
  const pair = compact.match(/\b([A-Z]{3}\/[A-Z]{3})\b/)
  if (pair) return pair[1].replace('/', '')
  const labelled = line.match(/^\s*(?:instrument|symbol|market)\s*[:=-]\s*([a-z0-9/_-]+)/i)
  return labelled?.[1]?.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function addLevel(
  result: ParsedDailyPlan,
  level: ParsedDailyPlanLevel,
  seen: Set<string>,
) {
  if (!Number.isFinite(level.price) || level.price <= 0) {
    result.warnings.push(`Ignored invalid ${level.direction.toLowerCase()} price from: "${level.sourceText}"`)
    return
  }
  const key = `${level.direction}:${level.price}`
  if (seen.has(key)) {
    result.warnings.push(`Duplicate ${level.direction.toLowerCase()} level ${level.price} was ignored.`)
    return
  }
  seen.add(key)
  result.levels.push(level)
}

export function isGoldInstrument(instrument?: string) {
  if (!instrument) return true
  const normalized = instrument.toUpperCase().replace(/[\s/]/g, '')
  return normalized === 'XAUUSD' || normalized === 'GOLD'
}

export function isInstrumentMatch(instrument: string | undefined, config: InstrumentConfiguration) {
  if (!instrument) return true
  const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const candidate = normalize(instrument)
  const aliases = [config.symbol, config.shortName, config.displayName].map(normalize)
  if (config.symbol === 'XAUUSD') aliases.push('GOLD')
  return aliases.includes(candidate)
}

export function parseDailyPlanText(text: string): ParsedDailyPlan {
  const result: ParsedDailyPlan = { levels: [], warnings: [], unparsedLines: [] }
  const seenLevels = new Set<string>()
  const notes: string[] = []
  const labels: string[] = []
  let pendingDirection: Direction | null = null
  let pendingScalar: 'approach' | 'tolerance' | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanLine(rawLine)
    if (!line) continue

    const detectedInstrument = instrumentFrom(line)
    if (detectedInstrument && !result.instrument) result.instrument = detectedInstrument

    const notesMatch = line.match(notesPattern)
    if (notesMatch) {
      if (notesMatch[2]) notes.push(notesMatch[2].trim())
      continue
    }
    const labelMatch = line.match(dateSessionPattern)
    if (labelMatch) {
      if (labelMatch[2]) labels.push(`${labelMatch[1]}: ${labelMatch[2].trim()}`)
      continue
    }

    if (biasContextPattern.test(line) || (detectedInstrument && /\b(bullish|bearish|neutral)\b/i.test(line))) {
      const bias = biasFrom(line)
      if (bias) result.bias = bias
      else result.warnings.push(`Bias wording was found but no supported bias was detected: "${line}"`)
      continue
    }

    if (approachPattern.test(line)) {
      const [value] = numbersFrom(line)
      if (value === undefined) pendingScalar = 'approach'
      else if (value >= 0) result.approachDistance = value
      else result.warnings.push(`Approach distance must be zero or greater: "${line}"`)
      continue
    }
    if (tolerancePattern.test(line)) {
      const [value] = numbersFrom(line)
      if (value === undefined) pendingScalar = 'tolerance'
      else if (value >= 0) result.entryTolerance = value
      else result.warnings.push(`Entry tolerance must be zero or greater: "${line}"`)
      continue
    }

    const direction = directionFrom(line)
    const values = numbersFrom(line)
    if (direction) {
      if (values.length) {
        values.forEach((price) => addLevel(result, {
          direction,
          price,
          sourceText: line,
          confidence: levelContextPattern.test(line) || /^[a-z\s]+[:=-]/i.test(line) ? 'high' : 'medium',
        }, seenLevels))
        pendingDirection = null
        continue
      }
      if (levelContextPattern.test(line) || /^(buy|sell|long|short|support|resistance|supply|demand)\s*[:=-]?$/i.test(line)) {
        pendingDirection = direction
        continue
      }
    }

    if (pendingScalar && values.length === 1 && values[0] >= 0) {
      if (pendingScalar === 'approach') result.approachDistance = values[0]
      else result.entryTolerance = values[0]
      pendingScalar = null
      continue
    }
    if (pendingDirection && values.length) {
      values.forEach((price) => addLevel(result, {
        direction: pendingDirection as Direction,
        price,
        sourceText: line,
        confidence: 'medium',
        warning: 'Direction was inherited from the preceding label.',
      }, seenLevels))
      pendingDirection = null
      continue
    }

    if (detectedInstrument && /\bplan\b/i.test(line)) continue
    result.unparsedLines.push(line)
    if (values.length) result.warnings.push(`Ambiguous numeric text was not applied as a level: "${line}"`)
  }

  if (pendingDirection) result.warnings.push(`A ${pendingDirection.toLowerCase()} label had no associated price.`)
  if (pendingScalar) result.warnings.push(`${pendingScalar === 'approach' ? 'Approach distance' : 'Entry tolerance'} had no associated value.`)
  if (notes.length) result.notes = notes.join('\n')
  if (labels.length) result.dateSessionLabel = labels.join(' · ')
  if (!result.levels.length) result.warnings.push('No valid labelled buy or sell levels were detected.')
  return result
}
