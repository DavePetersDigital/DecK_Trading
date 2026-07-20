import type { Request, Response } from 'express'
import { environment } from '../config/environment.js'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function prefersHtml(request: Request) {
  const accept = request.get('Accept') ?? ''
  if (accept.includes('application/json') && !accept.includes('text/html')) return false
  return true
}

function dashboardOrigin() {
  return environment.clientUrl.trim().replace(/\/$/, '') || 'http://localhost:3001'
}

export function wantsCTraderOAuthHtml(request: Request) {
  return prefersHtml(request)
}

export function sendCTraderOAuthSuccessPage(response: Response) {
  const origin = dashboardOrigin()
  response
    .status(200)
    .type('html')
    .send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>cTrader connected</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b121a; color: #d7e0ea; font: 15px/1.5 Inter, system-ui, sans-serif; }
    main { text-align: center; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 0; color: #8fa0b1; }
  </style>
</head>
<body>
  <main>
    <h1>cTrader connected successfully.</h1>
    <p>This window will close automatically.</p>
  </main>
  <script>
    window.opener?.postMessage({ type: "CTRADER_AUTH_SUCCESS" }, ${JSON.stringify(origin)});
    window.setTimeout(function () { window.close(); }, 1000);
  </script>
</body>
</html>`)
}

export function sendCTraderOAuthErrorPage(response: Response, statusCode: number, message: string) {
  const origin = dashboardOrigin()
  const safeMessage = message.trim() || 'Failed to connect to cTrader.'
  response
    .status(statusCode)
    .type('html')
    .send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>cTrader connection failed</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b121a; color: #d7e0ea; font: 15px/1.5 Inter, system-ui, sans-serif; }
    main { max-width: 420px; text-align: center; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    p { margin: 0; color: #8fa0b1; }
  </style>
</head>
<body>
  <main>
    <h1>cTrader connection failed</h1>
    <p>${escapeHtml(safeMessage)}</p>
  </main>
  <script>
    window.opener?.postMessage(
      { type: "CTRADER_AUTH_ERROR", message: ${JSON.stringify(safeMessage)} },
      ${JSON.stringify(origin)}
    );
  </script>
</body>
</html>`)
}
