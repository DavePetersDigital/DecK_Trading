import { describe, expect, it } from 'vitest'
import { applyTick, createBreakoutState } from './orbBreakout'

const HIGH = 100
const LOW = 90

describe('applyTick crossing logic', () => {
  it('does not signal on the first tick (no previous price)', () => {
    const { signals, state } = applyTick(createBreakoutState(), HIGH, LOW, 95, 101)
    expect(signals).toEqual([])
    expect(state.prevAsk).toBe(101)
  })

  it('fires an upside alert only when the ask crosses the ORB high', () => {
    let state = createBreakoutState()
    ;({ state } = applyTick(state, HIGH, LOW, 95, 100)) // prev established at/at high
    const first = applyTick(state, HIGH, LOW, 99, 101)
    expect(first.signals).toEqual([{ direction: 'up', triggerPrice: 101 }])

    // No second upside alert once latched.
    const second = applyTick(first.state, HIGH, LOW, 99, 102)
    expect(second.signals).toEqual([])
  })

  it('fires a downside alert only when the bid crosses the ORB low', () => {
    let state = createBreakoutState()
    ;({ state } = applyTick(state, HIGH, LOW, 95, 100)) // prevBid = 95 (>= low)
    const first = applyTick(state, HIGH, LOW, 89, 95)
    expect(first.signals).toEqual([{ direction: 'down', triggerPrice: 89 }])

    const second = applyTick(first.state, HIGH, LOW, 88, 95)
    expect(second.signals).toEqual([])
  })

  it('does not fire when price is already outside the range (no crossing)', () => {
    let state = createBreakoutState()
    ;({ state } = applyTick(state, HIGH, LOW, 101, 102)) // already above high
    const next = applyTick(state, HIGH, LOW, 103, 104)
    expect(next.signals).toEqual([])
  })

  it('can fire one upside and one downside independently', () => {
    let state = createBreakoutState()
    ;({ state } = applyTick(state, HIGH, LOW, 95, 100))
    const up = applyTick(state, HIGH, LOW, 95, 101)
    expect(up.signals).toEqual([{ direction: 'up', triggerPrice: 101 }])
    // bid drops from 95 to 89 → downside crossing still allowed.
    const down = applyTick(up.state, HIGH, LOW, 89, 101)
    expect(down.signals).toEqual([{ direction: 'down', triggerPrice: 89 }])
    expect(down.state.upsideAlerted).toBe(true)
    expect(down.state.downsideAlerted).toBe(true)
  })
})
