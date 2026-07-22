import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from './Cards'
import {
  ALERT_MODE_LABELS,
  ALERT_MODE_ORDER,
  COMMON_TIMEZONES,
  TREND_TIMEFRAME_LABELS,
  TREND_TIMEFRAME_ORDER,
  createOpeningProfile,
  deleteOpeningProfile,
  fetchOpeningProfiles,
  patchOpeningProfile,
  type AlertMode,
  type OpeningProfile,
  type TrendTimeframe,
} from '../services/openingProfilesApi'

interface Draft {
  displayName: string
  timezone: string
  openingTime: string
  closingTime: string
  alertMode: AlertMode
  trendEmaPeriod: number
  trendTimeframe: TrendTimeframe
  tradingWindowMinutes: number
  allowTradesAfterWindow: boolean
}

function toDraft(profile: OpeningProfile): Draft {
  return {
    displayName: profile.displayName,
    timezone: profile.timezone,
    openingTime: profile.openingTime,
    closingTime: profile.closingTime ?? '17:00',
    alertMode: profile.alertMode,
    trendEmaPeriod: profile.trendEmaPeriod,
    trendTimeframe: profile.trendTimeframe,
    tradingWindowMinutes: profile.tradingWindowMinutes ?? 120,
    allowTradesAfterWindow: profile.allowTradesAfterWindow ?? true,
  }
}

const EMPTY_NEW: Draft = {
  displayName: '',
  timezone: 'Europe/London',
  openingTime: '08:00',
  closingTime: '17:00',
  alertMode: 'all_breakouts',
  trendEmaPeriod: 200,
  trendTimeframe: 'D1',
  tradingWindowMinutes: 120,
  allowTradesAfterWindow: true,
}

function timezoneOptions(current: string): string[] {
  return COMMON_TIMEZONES.includes(current) ? COMMON_TIMEZONES : [current, ...COMMON_TIMEZONES]
}

function ProfileFields({
  draft,
  disabled,
  onChange,
}: {
  draft: Draft
  disabled: boolean
  onChange: (patch: Partial<Draft>) => void
}) {
  return (
    <div className="profile-fields">
      <label className="profile-field">
        <span>Name</span>
        <input
          type="text"
          value={draft.displayName}
          disabled={disabled}
          onChange={(event) => onChange({ displayName: event.target.value })}
        />
      </label>
      <label className="profile-field">
        <span>Timezone</span>
        <select
          value={draft.timezone}
          disabled={disabled}
          onChange={(event) => onChange({ timezone: event.target.value })}
        >
          {timezoneOptions(draft.timezone).map((zone) => (
            <option key={zone} value={zone}>{zone}</option>
          ))}
        </select>
      </label>
      <label className="profile-field">
        <span>Open time</span>
        <input
          type="time"
          value={draft.openingTime}
          disabled={disabled}
          onChange={(event) => onChange({ openingTime: event.target.value })}
        />
      </label>
      <label className="profile-field">
        <span>Close time</span>
        <input
          type="time"
          value={draft.closingTime}
          disabled={disabled}
          onChange={(event) => onChange({ closingTime: event.target.value })}
        />
      </label>
      <label className="profile-field">
        <span>Trading window (minutes)</span>
        <input
          type="number"
          min={1}
          max={1440}
          value={draft.tradingWindowMinutes}
          disabled={disabled}
          onChange={(event) => onChange({ tradingWindowMinutes: Number(event.target.value) })}
        />
      </label>
      <label className="profile-field profile-field-checkbox">
        <span>Allow trades after trading window</span>
        <input
          type="checkbox"
          checked={draft.allowTradesAfterWindow}
          disabled={disabled}
          onChange={(event) => onChange({ allowTradesAfterWindow: event.target.checked })}
        />
      </label>
      <label className="profile-field">
        <span>Strategy</span>
        <select
          value={draft.alertMode}
          disabled={disabled}
          onChange={(event) => onChange({ alertMode: event.target.value as AlertMode })}
        >
          {ALERT_MODE_ORDER.map((mode) => (
            <option key={mode} value={mode}>{ALERT_MODE_LABELS[mode]}</option>
          ))}
        </select>
      </label>
      <label className="profile-field">
        <span>Trend EMA period</span>
        <input
          type="number"
          min={1}
          max={1000}
          value={draft.trendEmaPeriod}
          disabled={disabled}
          onChange={(event) => onChange({ trendEmaPeriod: Number(event.target.value) })}
        />
      </label>
      <label className="profile-field">
        <span>Trend timeframe</span>
        <select
          value={draft.trendTimeframe}
          disabled={disabled}
          onChange={(event) => onChange({ trendTimeframe: event.target.value as TrendTimeframe })}
        >
          {TREND_TIMEFRAME_ORDER.map((timeframe) => (
            <option key={timeframe} value={timeframe}>{TREND_TIMEFRAME_LABELS[timeframe]}</option>
          ))}
        </select>
      </label>
    </div>
  )
}

export function OpeningProfileEditor() {
  const [profiles, setProfiles] = useState<OpeningProfile[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [adding, setAdding] = useState(false)
  const [newDraft, setNewDraft] = useState<Draft>(EMPTY_NEW)

  const load = useCallback(async () => {
    setError('')
    try {
      const next = await fetchOpeningProfiles()
      setProfiles(next)
      setDrafts(Object.fromEntries(next.map((profile) => [profile.id, toDraft(profile)])))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Opening Profiles.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const profile of profiles) {
      const draft = drafts[profile.id]
      map[profile.id] = draft ? JSON.stringify(draft) !== JSON.stringify(toDraft(profile)) : false
    }
    return map
  }, [profiles, drafts])

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id]!, ...patch } }))
  }

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The request could not be completed.')
    } finally {
      setBusyId(null)
    }
  }

  const save = (profile: OpeningProfile) => run(profile.id, async () => {
    const updated = await patchOpeningProfile(profile.id, drafts[profile.id]!)
    setProfiles((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    setDrafts((current) => ({ ...current, [updated.id]: toDraft(updated) }))
    setMessage(`${updated.displayName} saved.`)
  })

  const remove = (profile: OpeningProfile) => run(profile.id, async () => {
    if (!window.confirm(`Delete Opening Profile "${profile.displayName}"? Instruments using it will stop monitoring it.`)) {
      return
    }
    await deleteOpeningProfile(profile.id)
    setProfiles((current) => current.filter((item) => item.id !== profile.id))
    setMessage(`${profile.displayName} deleted.`)
  })

  const addProfile = () => run('__new__', async () => {
    const created = await createOpeningProfile({
      displayName: newDraft.displayName,
      timezone: newDraft.timezone,
      openingTime: newDraft.openingTime,
      closingTime: newDraft.closingTime,
      alertMode: newDraft.alertMode,
      trendEmaPeriod: newDraft.trendEmaPeriod,
      trendTimeframe: newDraft.trendTimeframe,
      tradingWindowMinutes: newDraft.tradingWindowMinutes,
      allowTradesAfterWindow: newDraft.allowTradesAfterWindow,
    })
    setProfiles((current) => [...current, created])
    setDrafts((current) => ({ ...current, [created.id]: toDraft(created) }))
    setNewDraft(EMPTY_NEW)
    setAdding(false)
    setMessage(`${created.displayName} created.`)
  })

  return (
    <Card
      title="Opening Profiles"
      eyebrow="ORB strategy configuration"
      className="opening-profile-editor"
      action={(
        <button className="primary" onClick={() => setAdding((value) => !value)}>
          {adding ? 'Close' : '+ New profile'}
        </button>
      )}
    >
      <div className="instrument-management-tools">
        <p>Opening Profiles define when an Opening Range begins and which ORB strategy and trend settings apply. Assign them to instruments in Monitored Instruments above.</p>
      </div>

      {error && <div className="import-message import-message--danger"><span>{error}</span></div>}
      {message && !error && <div className="import-message"><span>{message}</span></div>}

      {adding && (
        <div className="profile-card profile-card--new">
          <div className="profile-card-head"><strong>New Opening Profile</strong></div>
          <ProfileFields draft={newDraft} disabled={busyId === '__new__'} onChange={(patch) => setNewDraft((current) => ({ ...current, ...patch }))} />
          <div className="button-row">
            <button className="secondary" onClick={() => { setAdding(false); setNewDraft(EMPTY_NEW) }}>Cancel</button>
            <button
              className="primary"
              disabled={busyId === '__new__' || !newDraft.displayName.trim()}
              onClick={() => void addProfile()}
            >
              {busyId === '__new__' ? 'Creating…' : 'Create profile'}
            </button>
          </div>
        </div>
      )}

      {profiles.length === 0 && <div className="queue-empty">No Opening Profiles defined.</div>}

      <div className="profile-list">
        {profiles.map((profile) => {
          const draft = drafts[profile.id]
          if (!draft) return null
          const busy = busyId === profile.id
          return (
            <div className="profile-card" key={profile.id}>
              <div className="profile-card-head">
                <strong>{profile.displayName}</strong>
                <span className="orb-subtle">{profile.id}</span>
              </div>
              <ProfileFields draft={draft} disabled={busy} onChange={(patch) => updateDraft(profile.id, patch)} />
              <div className="button-row">
                <button className="secondary compact-button danger-text" disabled={busy} onClick={() => void remove(profile)}>
                  Delete
                </button>
                <button className="primary compact-button" disabled={busy || !dirty[profile.id]} onClick={() => void save(profile)}>
                  {busy ? 'Saving…' : dirty[profile.id] ? 'Save changes' : 'Saved'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
