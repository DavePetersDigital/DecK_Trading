# Deck Trading Dashboard

A local trading-assistant dashboard with a React/Vite client and Express API.

## Development

Install all workspace dependencies:

```bash
npm install
```

Run the client and server together:

```bash
npm run dev
```

- Dashboard: http://localhost:3001
- API: http://localhost:3002
- Health check: http://localhost:3002/api/health

The Vite development server proxies `/api` requests to Express.

## Project structure

- `client/` — existing React, TypeScript and Vite dashboard
- `server/` — Express and TypeScript API
- `docs/` — supporting MT4 indicators

## Validation

```bash
npm run build
npm run lint
```
