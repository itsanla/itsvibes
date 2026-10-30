import { router, usePathname } from 'expo-router'
import { type MouseEvent, useMemo, useState } from 'react'
import type { SessionSummary } from '../../../shared/protocol'
import { useClient } from '../lib/client'
import { shortPath, timeAgo } from '../lib/format'
import SessionTools from './SessionTools'
import { Dialog, I, setUI, useUI } from './ui'

function bucket(ms: number): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = 86_400_000
  if (ms >= today.getTime()) return 'Hari ini'
  if (ms >= today.getTime() - day) return 'Kemarin'
  if (ms >= today.getTime() - 7 * day) return '7 hari terakhir'
  if (ms >= today.getTime() - 30 * day) return '30 hari terakhir'
  return 'Lebih lama'
}

function groupSessions(list: SessionSummary[]): { label: string; items: SessionSummary[] }[] {
  const attention = list.filter(s => s.pending > 0 || s.status === 'waiting')
  const running = list.filter(s => !attention.includes(s) && (s.status === 'running' || s.status === 'starting'))
  const rest = list.filter(s => !attention.includes(s) && !running.includes(s))
  const groups: { label: string; items: SessionSummary[] }[] = []
  if (attention.length) groups.push({ label: 'Perlu jawaban', items: attention })
  if (running.length) groups.push({ label: 'Berjalan', items: running })
  for (const s of rest) {
    const label = bucket(s.mtime)
    const g = groups.find(x => x.label === label)
    if (g) g.items.push(s)
    else groups.push({ label, items: [s] })
  }
  return groups
}

// sesi yang sedang bekerja atau terbuka di terminal tidak bisa dipilih untuk dihapus
const locked = (s: SessionSummary) => s.pending > 0 || s.status === 'running' || s.status === 'starting' || s.status === 'waiting' || s.status === 'terminal'

export function newSession() {
  router.push('/')
  setTimeout(() => document.getElementById('iv-composer')?.focus(), 80)
}

export default function Sidebar() {
  const c = useClient()
  const ui = useUI()
  const active = /^\/session\/([^/]+)/.exec(usePathname())?.[1]
  const [q, setQ] = useState('')
  const [drag, setDrag] = useState(false)
  const [picked, setPicked] = useState<Set<string> | null>(null) // null = bukan mode pilih
  const [confirm, setConfirm] = useState(false)

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = c.sessions.filter(s => !needle || s.title.toLowerCase().includes(needle) || s.cwd.toLowerCase().includes(needle))
    return groupSessions([...list].sort((a, b) => b.mtime - a.mtime))
  }, [c.sessions, q])

  const toggle = (id: string) => {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }
  const visible = groups.flatMap(g => g.items).filter(s => !locked(s))
  const remove = () => {
    const ids = [...(picked ?? [])]
    c.deleteSessions(ids)
    if (active && ids.includes(active)) router.replace('/')
    setConfirm(false)
    setPicked(null)
  }

  const startResize = (e: MouseEvent) => {
    e.preventDefault()
    setDrag(true)
    document.body.style.userSelect = 'none'
    const move = (ev: globalThis.MouseEvent) => setUI({ sidebarWidth: Math.max(240, Math.min(520, ev.clientX)) })
    const up = () => {
      setDrag(false)
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const conn = c.conn === 'online' ? { cls: 'ok', text: 'Tersambung ke Bima' }
    : c.conn === 'connecting' ? { cls: 'warn', text: 'Menyambung…' }
    : c.conn === 'unauthorized' ? { cls: 'err', text: 'Token tidak berlaku' }
    : { cls: 'err', text: 'Terputus' }
  const notif = c.notifierOn

  return (
    <aside className="iv-side" style={{ width: ui.sidebarWidth }}>
      <div className="iv-side-head">
        <span className="iv-brand">itsvibes</span>
        <div className="iv-spacer" />
        <button className="iv-icon-btn" onClick={() => c.refreshSessions()} title="Muat ulang daftar sesi">
          {c.sessionsLoading ? <span className="iv-spin" /> : <I n="refresh" />}
        </button>
        <button className={`iv-icon-btn${picked ? ' on' : ''}`} onClick={() => setPicked(picked ? null : new Set())} title="Pilih sesi untuk dihapus"><I n="trash" /></button>
        <button className="iv-icon-btn" onClick={() => setUI({ sidebarOpen: false })} title="Sembunyikan sidebar (Ctrl+B)"><I n="sidebar" /></button>
      </div>
      <button className="iv-new" onClick={newSession}>
        <I n="plus" s={18} w={2.4} /> Sesi baru <span className="iv-kbd">Ctrl+Shift+O</span>
      </button>
      <label className="iv-search">
        <I n="search" s={16} />
        <input id="iv-search" placeholder="Cari sesi atau folder" value={q} onChange={e => setQ(e.target.value)} />
        {q ? <button className="iv-icon-btn" style={{ width: 22, height: 22 }} onClick={() => setQ('')}><I n="close" s={14} /></button> : <span className="iv-kbd">Ctrl+K</span>}
      </label>
      <SessionTools id={active} />
      {picked ? (
        <div className="iv-bulk">
          <span>{picked.size} dipilih</span>
          <button onClick={() => setPicked(picked.size === visible.length ? new Set() : new Set(visible.map(s => s.id)))}>Semua</button>
          <button className="del" disabled={!picked.size} onClick={() => setConfirm(true)}>Hapus</button>
          <button onClick={() => setPicked(null)}>Batal</button>
        </div>
      ) : null}
      <div className="iv-list">
        {groups.map(g => (
          <div key={g.label}>
            <div className="iv-group">{g.label}</div>
            {g.items.map(s => (
              <button
                key={s.id}
                className={`iv-item${s.id === active && !picked ? ' active' : ''}`}
                disabled={!!picked && locked(s)}
                style={picked && locked(s) ? { opacity: 0.45 } : undefined}
                onClick={() => (picked ? toggle(s.id) : router.push(`/session/${s.id}`))}
              >
                {picked ? <span className={`iv-check${picked.has(s.id) ? ' on' : ''}`}>{picked.has(s.id) ? <I n="check" s={13} w={3} c="#1a1a1a" /> : null}</span> : null}
                <div className="iv-item-main">
                  <div className="iv-item-title">{s.title}</div>
                  <div className="iv-item-sub">{shortPath(s.cwd) || s.project} · {timeAgo(s.mtime)}{s.automated ? ' · otomatis' : ''}</div>
                </div>
                {s.pending > 0 ? <span className="iv-badge">{s.pending}</span>
                  : s.status === 'running' || s.status === 'starting' ? <span className="iv-dot run" title="Berjalan" />
                  : s.status === 'waiting' ? <span className="iv-dot warn" title="Menunggu kamu" />
                  : s.status === 'terminal' ? <span className="iv-tag">terminal</span>
                  : s.status === 'idle' ? <span className="iv-dot ok" title="Siap" /> : null}
              </button>
            ))}
          </div>
        ))}
        {!groups.length ? <div className="iv-group" style={{ textAlign: 'center', textTransform: 'none', fontSize: 13 }}>{c.sessionsLoading ? 'Memuat…' : 'Tidak ada sesi'}</div> : null}
      </div>
      <div className="iv-side-foot">
        <span className={`iv-dot ${conn.cls}`} />
        <span className="iv-grow" title={conn.text}>{conn.text}</span>
        <button className={`iv-icon-btn${notif ? ' on' : ''}`} title={notif ? 'Notifikasi aktif, klik untuk mematikan' : 'Notifikasi mati, klik untuk menyalakan'} onClick={() => {
          void c.setNotifier(!notif)
          c.showToast(notif ? 'Notifikasi dimatikan' : 'Notifikasi aktif')
        }}>
          <I n="bell" c={notif ? 'var(--ok)' : undefined} />
        </button>
        <button className="iv-icon-btn" title="Pengaturan" onClick={() => setUI({ settings: true })}><I n="gear" /></button>
      </div>
      <div className={`iv-resizer${drag ? ' drag' : ''}`} onMouseDown={startResize} />
      {confirm ? (
        <Dialog title={`Hapus ${picked?.size ?? 0} sesi?`} width={440} onClose={() => setConfirm(false)}>
          <p style={{ margin: '0 0 16px', color: 'var(--dim)' }}>Berkas JSONL sesi ini dihapus permanen dari ~/.claude di Bima dan tidak bisa dikembalikan.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="iv-btn" onClick={() => setConfirm(false)}>Batal</button>
            <button className="iv-btn danger" onClick={remove}>Hapus permanen</button>
          </div>
        </Dialog>
      ) : null}
    </aside>
  )
}
