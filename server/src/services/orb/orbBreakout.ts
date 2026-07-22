// Pure ORB breakout detection using crossing logic only.
// Upside:   previous Ask <= ORB High  AND  current Ask > ORB High
// Downside: previous Bid >= ORB Low   AND  current Bid < ORB Low
// A maximum of one upside and one downside alert may fire per monitor.

export type BreakoutDirection = 'up' | 'down'

export interface BreakoutState {
  prevBid: number | null
  prevAsk: number | null
  upsideAlerted: boolean
  downsideAlerted: boolean
}

export interface BreakoutSignal {
  direction: BreakoutDirection
  triggerPrice: number
}

export function createBreakoutState(overrides: Partial<BreakoutState> = {}): BreakoutState {
  return {
    prevBid: null,
    prevAsk: null,
    upsideAlerted: false,
    downsideAlerted: false,
    ...overrides,
  }
}

/**
 * Evaluate a new tick against the ORB. Returns any breakout signals plus the
 * next state (prev prices updated, alerted flags latched). Pure: it does not
 * mutate the supplied state.
 */
export function applyTick(
  state: BreakoutState,
  orbHigh: number,
  orbLow: number,
  bid: number,
  ask: number,
): { signals: BreakoutSignal[]; state: BreakoutState } {
  const signals: BreakoutSignal[] = []

  const upsideCross =
    !state.upsideAlerted &&
    state.prevAsk !== null &&
    state.prevAsk <= orbHigh &&
    ask > orbHigh
  if (upsideCross) {
    signals.push({ direction: 'up', triggerPrice: ask })
  }

  const downsideCross =
    !state.downsideAlerted &&
    state.prevBid !== null &&
    state.prevBid >= orbLow &&
    bid < orbLow
  if (downsideCross) {
    signals.push({ direction: 'down', triggerPrice: bid })
  }

  return {
    signals,
    state: {
      prevBid: bid,
      prevAsk: ask,
      upsideAlerted: state.upsideAlerted || upsideCross,
      downsideAlerted: state.downsideAlerted || downsideCross,
    },
  }
}
