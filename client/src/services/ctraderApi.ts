export interface CTraderCandle {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

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

export async function fetchCTraderHistory(params: {
  symbolId: string
  timeframe: string
  count: number
}): Promise<CTraderCandle[]> {
  const query = new URLSearchParams({
    symbolId: params.symbolId,
    timeframe: params.timeframe,
    count: String(params.count),
  })
  const response = await fetch(`/api/ctrader/history?${query}`)
  if (!response.ok) {
    let message = `Failed to load cTrader history (${response.status}).`
    try {
      const payload = await response.json() as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Keep the status-based message when the body is not JSON.
    }
    throw new Error(message)
  }
  const payload = await response.json() as CTraderCandle[]
  if (!Array.isArray(payload)) {
    throw new Error('Unexpected cTrader history response.')
  }
  return payload
}
