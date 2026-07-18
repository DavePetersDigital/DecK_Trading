import express from 'express'

const app = express()
const port = Number(process.env.PORT ?? 3002)

app.disable('x-powered-by')
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'deck-trading-dashboard-server',
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/status', (_request, response) => {
  response.json({
    dataSource: 'mock',
    cTrader: 'not-connected',
    telegram: 'not-connected',
  })
})

app.listen(port, 'localhost', () => {
  console.log(`Deck Trading Dashboard API listening on http://localhost:${port}`)
})
