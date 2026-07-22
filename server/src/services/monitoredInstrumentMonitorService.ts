import {
  enabledSessionKeys,
  type ManipulationMode,
  type MonitoredSessionKey,
} from './monitoredInstrumentRules.js'
import { listMonitoredInstruments } from './monitoredInstrumentStore.js'

// Read-only projection consumed by future background ORB monitoring code.
// It deliberately avoids React, HTTP and browser concerns so a headless
// monitor can request configuration without any dashboard tab being open.
export interface MonitorableInstrument {
  symbolId: string
  symbolName: string
  displayName: string
  enabledSessions: MonitoredSessionKey[]
  openingProfileIds: string[]
  entryTimeframe: 'M5'
  orbTimeframe: 'M15'
  manipulationMode: ManipulationMode
}

/**
 * All instruments the monitor should watch: enabled, with at least one
 * enabled session. Timeframes and manipulation mode are surfaced for the
 * future monitor without performing any subscription or calculation here.
 */
export async function getEnabledMonitoredInstruments(): Promise<MonitorableInstrument[]> {
  const instruments = await listMonitoredInstruments()
  return instruments
    .filter((instrument) => instrument.enabled)
    .map((instrument) => ({
      symbolId: instrument.symbolId,
      symbolName: instrument.symbolName,
      displayName: instrument.displayName,
      enabledSessions: enabledSessionKeys(instrument.sessions),
      openingProfileIds: instrument.openingProfileIds ?? [],
      entryTimeframe: instrument.entryTimeframe,
      orbTimeframe: instrument.orbTimeframe,
      manipulationMode: instrument.manipulationMode,
    }))
    .filter((instrument) => instrument.openingProfileIds.length > 0)
}

/** Enabled session identifiers for a single monitored symbol, or null if absent/disabled. */
export async function getEnabledSessionsForSymbol(symbolId: string): Promise<MonitoredSessionKey[] | null> {
  const instruments = await getEnabledMonitoredInstruments()
  const found = instruments.find((instrument) => instrument.symbolId === symbolId)
  return found ? found.enabledSessions : null
}
