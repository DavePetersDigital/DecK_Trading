import { BASE_PRICE } from '../data/mockData'
import { formatPrice } from '../utils/trading'

export function MockPriceController({ price, onChange }: { price: number; onChange: (price: number) => void }) {
  return (
    <div className="price-controller">
      <div><span>DEV · MOCK PRICE</span><strong>{formatPrice(price)}</strong></div>
      <div className="price-buttons">
        <button onClick={() => onChange(price - 1)} aria-label="Decrease price by 1">−1.00</button>
        <button onClick={() => onChange(price - 0.1)} aria-label="Decrease price by 0.1">−0.10</button>
        <button onClick={() => onChange(BASE_PRICE)} aria-label="Reset mock price">Reset</button>
        <button onClick={() => onChange(price + 0.1)} aria-label="Increase price by 0.1">+0.10</button>
        <button onClick={() => onChange(price + 1)} aria-label="Increase price by 1">+1.00</button>
      </div>
    </div>
  )
}
