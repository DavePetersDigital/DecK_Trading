export const CTRADER_AUTH_SUCCESS = 'CTRADER_AUTH_SUCCESS'
export const CTRADER_AUTH_ERROR = 'CTRADER_AUTH_ERROR'
export const CTRADER_OAUTH_POPUP_NAME = 'ctrader-oauth'

/** Backend origin that serves /api/ctrader/login and /api/ctrader/callback. */
export const CTRADER_OAUTH_ORIGIN =
  (import.meta.env.VITE_CTRADER_API_ORIGIN as string | undefined)?.trim() || 'http://localhost:3002'

export const CTRADER_LOGIN_URL = `${CTRADER_OAUTH_ORIGIN}/api/ctrader/login`

export type CTraderAuthMessage =
  | { type: typeof CTRADER_AUTH_SUCCESS }
  | { type: typeof CTRADER_AUTH_ERROR; message: string }

export type StartCTraderOAuthResult =
  | { mode: 'popup'; popup: Window }
  | { mode: 'tab'; message: string }

function centeredPopupFeatures(width: number, height: number) {
  const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0
  const dualScreenTop = window.screenTop ?? window.screenY ?? 0
  const viewportWidth = window.outerWidth || document.documentElement.clientWidth || width
  const viewportHeight = window.outerHeight || document.documentElement.clientHeight || height
  const left = Math.max(0, Math.round(dualScreenLeft + (viewportWidth - width) / 2))
  const top = Math.max(0, Math.round(dualScreenTop + (viewportHeight - height) / 2))
  return `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
}

/**
 * Opens the cTrader OAuth login flow in a centred popup.
 * Falls back to a new tab when the popup is blocked.
 */
export function startCTraderOAuth(): StartCTraderOAuthResult {
  const popup = window.open(
    CTRADER_LOGIN_URL,
    CTRADER_OAUTH_POPUP_NAME,
    centeredPopupFeatures(600, 750),
  )

  if (!popup) {
    // Keep opener available so the callback page can postMessage back.
    window.open(CTRADER_LOGIN_URL, '_blank')
    return {
      mode: 'tab',
      message: 'Authentication opened in a new tab. The dashboard will update after you connect.',
    }
  }

  popup.focus()
  return { mode: 'popup', popup }
}

export function isCTraderAuthMessage(value: unknown): value is CTraderAuthMessage {
  if (!value || typeof value !== 'object') return false
  const type = (value as { type?: unknown }).type
  if (type === CTRADER_AUTH_SUCCESS) return true
  if (type === CTRADER_AUTH_ERROR) {
    const message = (value as { message?: unknown }).message
    return typeof message === 'string'
  }
  return false
}
