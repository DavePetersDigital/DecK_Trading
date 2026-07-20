export type CTraderServiceStatus =
  | 'connected'
  | 'not_connected'
  | 'not_configured'
  | 'connection_expired'
  | 'error'

export function isCTraderConnectable(status: CTraderServiceStatus, configured: boolean) {
  if (status === 'connected') return false
  if (status === 'not_configured') return configured
  return (
    status === 'not_connected' ||
    status === 'connection_expired' ||
    status === 'error'
  )
}
