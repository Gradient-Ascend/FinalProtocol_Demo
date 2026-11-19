import { useRef, useState, useSyncExternalStore } from 'react'
import { Download, HardDrive, RotateCcw, Save, Trash2, Upload, UserPlus } from 'lucide-react'
import { battleStore } from '@/game/battle-store'
import { progressSaver } from '@/game/progress-saver'

function formatSavedAt(ts: number | null): string {
  if (ts === null) return 'AUTO-SAVE READY'
  const date = new Date(ts)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `SAVED ${hh}:${mm}:${ss}`
}

export function ProgressSaver({ compact = false }: { compact?: boolean }) {
  const snapshot = useSyncExternalStore(progressSaver.subscribe, progressSaver.getSnapshot)
  const { activeUser, hostScope, current, users } = snapshot
  const [draft, setDraft] = useState('')
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const clearConfirms = () => {
    setConfirmWipe(false)
    setConfirmRemove(false)
  }

  const handleSaveNow = () => {
    clearConfirms()
    battleStore.sfx('ui')
    const summary = progressSaver.saveCheckpointNow()
    setNotice({ text: `Checkpoint stored for USER ${summary.user.toUpperCase()}.` })
  }

  const handleExport = () => {
    clearConfirms()
    battleStore.sfx('ui')
    const { filename, json } = progressSaver.exportSaveBundle()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice({ text: `Exported ${filename}.` })
  }

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    clearConfirms()
    try {
      const text = await file.text()
      const res = progressSaver.importSaveBundle(text)
      if (!res.ok) {
        setNotice({ text: res.error, error: true })
        return
      }
      battleStore.sfx('ui')
      setNotice({ text: `Imported save into USER ${res.summary.user.toUpperCase()}.` })
    } catch {
      setNotice({ text: 'Could not read the selected save file.', error: true })
    }
  }

  const handleReset = () => {
    if (!confirmWipe) {
      setConfirmRemove(false)
      setConfirmWipe(true)
      return
    }
    clearConfirms()
    battleStore.sfx('ui')
    const summary = progressSaver.resetCurrentSave(false)
    setNotice({ text: `Cleared save slot for USER ${summary.user.toUpperCase()}.` })
  }

  const handleRemoveUser = () => {
    if (activeUser === 'default') return
    if (!confirmRemove) {
      setConfirmWipe(false)
      setConfirmRemove(true)
      return
    }
    const removed = activeUser
    clearConfirms()
    battleStore.sfx('ui')
    progressSaver.resetCurrentSave(true)
    setNotice({ text: `Removed profile USER ${removed.toUpperCase()}; active profile DEFAULT.` })
  }

  const handleSwitch = (target: string) => {
    clearConfirms()
    if (target === activeUser) return
    battleStore.sfx('ui')
    const summary = progressSaver.switchUser(target)
    setNotice({ text: `Switched to USER ${summary.user.toUpperCase()}.` })
  }

  const handleCreateSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const raw = draft.trim()
    if (!raw) {
      setNotice({ text: 'Enter a profile handle (e.g. alice).', error: true })
      return
    }
    clearConfirms()
    battleStore.sfx('ui')
    const summary = progressSaver.switchUser(raw)
    setDraft('')
    setNotice({ text: `Active profile set to USER ${summary.user.toUpperCase()}.` })
  }

  return (
    <div className={`saver-root ${compact ? 'compact' : ''}`}>
      <div className="saver-card">
        <div className="saver-card-head">
          <div className="saver-user-label">
            <HardDrive size={14} />
            <strong>USER // {activeUser.toUpperCase()}</strong>
          </div>
          <div className="saver-card-tags">
            <span className="saver-pill">{hostScope ? `HOST / ${hostScope.toUpperCase()}` : 'HOST / LOCAL'}</span>
            <span className="saver-stamp">{formatSavedAt(current.savedAt)}</span>
          </div>
        </div>

        <div className="saver-headline">{current.headline}</div>
        <p className="saver-note">Browser-local per user (1 save each). Export .json to move across devices or hosts.</p>

        <div className="saver-actions">
          <button type="button" className="saver-btn primary" onClick={handleSaveNow}>
            <Save size={13} /> SAVE NOW
          </button>
          <button type="button" className="saver-btn" onClick={handleExport}>
            <Download size={13} /> EXPORT .JSON
          </button>
          <button type="button" className="saver-btn" onClick={() => fileInput.current?.click()}>
            <Upload size={13} /> IMPORT .JSON
          </button>
          <button
            type="button"
            className={`saver-btn ${confirmWipe ? 'danger' : ''}`}
            onClick={handleReset}
            onBlur={() => setConfirmWipe(false)}
          >
            <RotateCcw size={13} /> {confirmWipe ? 'CONFIRM WIPE?' : 'RESET SAVE'}
          </button>
          {activeUser !== 'default' && (
            <button
              type="button"
              className={`saver-btn ${confirmRemove ? 'danger' : ''}`}
              onClick={handleRemoveUser}
              onBlur={() => setConfirmRemove(false)}
            >
              <Trash2 size={13} /> {confirmRemove ? 'CONFIRM REMOVE?' : 'REMOVE USER'}
            </button>
          )}
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="saver-file-input"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleImportFile}
        />
      </div>

      <div className="saver-users">
        <div className="section-heading">
          <span>PROFILES ON THIS HOST</span>
          <span>ONE SAVE PER USER</span>
        </div>

        <div className="saver-chips" role="group" aria-label="User profiles on this host">
          {users.map((entry) => (
            <button
              type="button"
              key={entry.user}
              className={`saver-chip ${entry.active ? 'active' : ''}`}
              aria-pressed={entry.active}
              aria-label={`Switch to user ${entry.user}`}
              onClick={() => handleSwitch(entry.user)}
            >
              <span>{entry.user.toUpperCase()}</span>
              <i>{entry.badge}</i>
            </button>
          ))}
        </div>

        <form className="saver-form" onSubmit={handleCreateSubmit}>
          <input
            type="text"
            maxLength={24}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="enter user id (e.g. alice)…"
            aria-label="User ID"
          />
          <button type="submit" className="saver-btn">
            <UserPlus size={13} /> SWITCH / CREATE
          </button>
        </form>
      </div>

      {notice && (
        <p className={`saver-notice ${notice.error ? 'is-error' : ''}`} role="status">
          {notice.text}
        </p>
      )}
    </div>
  )
}
