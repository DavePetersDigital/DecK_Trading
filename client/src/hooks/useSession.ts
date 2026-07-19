import { useContext } from 'react'
import { SessionContext } from '../context/sessionContextValue'

export function useSession() {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession must be used inside SessionProvider')
  return session
}
