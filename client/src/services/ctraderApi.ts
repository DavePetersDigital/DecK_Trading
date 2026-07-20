export interface CTraderSymbol {
  symbolId: string
  symbolName: string
  enabled: boolean
}

export interface CTraderSymbolDiscovery {
  success: boolean
  symbols: CTraderSymbol[]
  goldMatches: CTraderSymbol[]
  error?: string
}

export async function fetchCTraderSymbols(): Promise<CTraderSymbolDiscovery> {
  const response = await fetch('/api/ctrader/symbols')
  const payload = await response.json() as CTraderSymbolDiscovery
  if (!response.ok) {
    throw new Error(payload.error || `Failed to load cTrader symbols (${response.status}).`)
  }
  return payload
}
