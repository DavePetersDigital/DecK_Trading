import type { InstrumentCategory } from '../types'

export function normalizeCTraderSymbolName(symbolName: string) {
  return symbolName.trim().toUpperCase().replace(/\s+/g, '')
}

export function guessInstrumentCategory(symbolName: string): InstrumentCategory {
  const name = symbolName.toUpperCase()
  if (name.includes('XAU') || name.includes('XAG') || name.includes('GOLD') || name.includes('SILVER')) {
    return 'Metal'
  }
  if (name.includes('BTC') || name.includes('ETH') || name.includes('CRYPTO')) {
    return 'Crypto'
  }
  if (name.includes('USOIL') || name.includes('BRENT') || name.includes('WTI') || name.includes('XBR') || name.includes('XTI') || name.includes('NATGAS')) {
    return 'Energy'
  }
  if (
    name.includes('NAS') ||
    name.includes('US30') ||
    name.includes('US500') ||
    name.includes('SPX') ||
    name.includes('DAX') ||
    name.includes('GER') ||
    name.includes('UK100') ||
    name.includes('JP225') ||
    name.includes('HK50')
  ) {
    return 'Index'
  }
  if (/^[A-Z]{6}([._-]|$)/.test(name) || name.length === 6) {
    return 'Forex'
  }
  return 'Other'
}

export function guessDisplayName(symbolName: string) {
  return normalizeCTraderSymbolName(symbolName)
}

export function guessShortName(symbolName: string) {
  const normalized = normalizeCTraderSymbolName(symbolName)
  return normalized.length > 8 ? normalized.slice(0, 8) : normalized
}

export function parseCTraderSymbolId(symbolId: string) {
  if (!/^\d+$/.test(symbolId)) return undefined
  const parsed = Number(symbolId)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}
