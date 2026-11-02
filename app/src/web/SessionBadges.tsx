import { useEffect, useState } from 'react'
import type { ShellTask } from '../../../shared/protocol'
import { Drawer, I } from './ui'

// Lencana di samping chip model: browser yang sedang dipakai Claude dan shell latar belakang yang masih hidup.

export function BrowserBadge({ sessionId }: { sessionId: string }) {
  return (
    <a className="iv-badge run" href={`/browser?s=${sessionId}`} target="_blank" rel="noopener" title="Buka layar browser di tab baru">
      <i className="iv-dot run" />
      <I n="globe" s={13} />
      <span>Browser aktif</span>
    </a>
  )
}

const typeLabel = (t: string) => (t === 'local_bash' ? 'Shell' : 'Monitor')

export function ShellBadge({ shells }: { shells: ShellTask[] }) {
  const [open, setOpen] = useState(false)
  if (!shells.length) return null
  return (
    <>
      <button className="iv-badge run" onClick={() => setOpen(true)} title="Lihat shell yang sedang berjalan">
        <i className="iv-dot run" />
        <I n="terminal" s={13} />
        <span>{shells.length} shell aktif</span>
      </button>
      {open ? <ShellDrawer shells={shells} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function ShellDrawer({ shells, onClose }: { shells: ShellTask[]; onClose: () => void }) {
  return (
    <Drawer title="Shell aktif" sub={`${shells.length} berjalan di latar belakang`} onClose={onClose}>
      {shells.map(s => (
        <div key={s.id} className="iv-shell">
          <div className="iv-shell-top">
            <I n="terminal" s={14} />
            <b>{typeLabel(s.type)}</b>
            <code>{s.id}</code>
            <span className="iv-pill run"><i className="iv-dot run" /> berjalan</span>
          </div>
          <pre>{s.description}</pre>
        </div>
      ))}
    </Drawer>
  )
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Compact tidak melaporkan persentase, jadi batangnya bergerak terus (indeterminate) dan waktu berjalan menunjukkan prosesnya hidup
export function CompactBar({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="iv-compact" role="status">
      <div className="iv-compact-top">
        <span className="iv-spin" />
        <b>Meringkas percakapan (compact)</b>
        <span className="iv-compact-time">{clock(now - since)}</span>
      </div>
      <div className="iv-compact-track"><div className="iv-compact-fill" /></div>
      <small>Claude tidak macet. Ia sedang merangkum riwayat supaya konteks muat, lalu lanjut sendiri.</small>
    </div>
  )
}
