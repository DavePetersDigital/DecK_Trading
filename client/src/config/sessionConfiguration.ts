import type { SessionConfiguration } from '../types/session'

export const defaultSessionConfiguration: SessionConfiguration = {
  sessions: {
    tokyo: {
      id: 'tokyo',
      name: 'Tokyo',
      timeZone: 'Asia/Tokyo',
      open: { hour: 9, minute: 0 },
      close: { hour: 15, minute: 0 },
    },
    london: {
      id: 'london',
      name: 'London',
      timeZone: 'Europe/London',
      open: { hour: 8, minute: 0 },
      close: { hour: 17, minute: 0 },
    },
    newYork: {
      id: 'newYork',
      name: 'New York',
      timeZone: 'America/New_York',
      open: { hour: 9, minute: 30 },
      close: { hour: 17, minute: 0 },
    },
  },
  openingSoonMinutes: 30,
  closingSoonMinutes: 30,
  candleAlertSeconds: 60,
  brokerUtcOffsetMinutes: 120,
}
