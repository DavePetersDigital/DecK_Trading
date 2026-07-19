import type { InstrumentConfiguration } from '../types'
import { formatPrice } from '../utils/trading'

export function MockPriceController({ price, config, resetPrice, onChange }: { price: number; config: InstrumentConfiguration; resetPrice: number; onChange: (price: number) => void }) {
  const smallStep = config.priceStep
  const largeStep = Math.max(config.defaultEntryTolerance, smallStep * 10)
  const signed = (value: number) => `${value > 0 ? '+' : '−'}${formatPrice(Math.abs(value), config.priceDecimals)}`
  return (
    <div className="price-controller">
      <div><span>DEV · {config.symbol} MOCK PRICE</span><strong>{formatPrice(price, config.priceDecimals)}</strong></div>
      <div className="price-buttons">
        <button onClick={() => onChange(price - largeStep)} aria-label={`Decrease price by ${largeStep}`}>{signed(-largeStep)}</button>
        <button onClick={() => onChange(price - smallStep)} aria-label={`Decrease price by ${smallStep}`}>{signed(-smallStep)}</button>
        <button onClick={() => onChange(resetPrice)} aria-label="Reset mock price">Reset</button>
        <button onClick={() => onChange(price + smallStep)} aria-label={`Increase price by ${smallStep}`}>{signed(smallStep)}</button>
        <button onClick={() => onChange(price + largeStep)} aria-label={`Increase price by ${largeStep}`}>{signed(largeStep)}</button>
      </div>
    </div>
  )
}
