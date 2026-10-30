import { router, usePathname } from 'expo-router'
import { type ReactNode, useEffect } from 'react'
import { useClient } from '../lib/client'
import { CSS } from './styles'
import SettingsDialog from './SettingsDialog'
import ShortcutsDialog from './ShortcutsDialog'
import Sidebar, { newSession } from './Sidebar'
import UsagePanel from './UsagePanel'
import { getUI, setUI, useUI } from './ui'

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

// Pintasan keyboard global. Sengaja hanya kombinasi yang boleh dicegat browser (Ctrl+N, Ctrl+T, Ctrl+W tidak bisa).
function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'k') {
        e.preventDefault()
        setUI({ sidebarOpen: true })
        setTimeout(() => (document.getElementById('iv-search') as HTMLInputElement | null)?.focus(), 30)
      } else if (mod && e.shiftKey && k === 'o') {
        e.preventDefault()
        newSession()
      } else if (mod && k === 'b') {
        e.preventDefault()
        setUI({ sidebarOpen: !getUI().sidebarOpen })
      } else if (mod && k === '\\') {
        e.preventDefault()
        setUI({ panelOpen: !getUI().panelOpen })
      } else if ((mod && k === '/') || (!mod && e.key === '?' && !typing(e.target))) {
        e.preventDefault()
        setUI({ shortcuts: true })
      } else if (!mod && e.key === '/' && !typing(e.target)) {
        e.preventDefault()
        document.getElementById('iv-composer')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export default function Shell({ children }: { children: ReactNode }) {
  const c = useClient()
  const ui = useUI()
  const path = usePathname()
  useHotkeys()

  // judul tab: jumlah permintaan yang menunggu, atau tanda sedang berjalan
  const runs = [...c.runs.values()]
  const pending = runs.reduce((n, r) => n + r.pending.length, 0)
  const running = runs.some(r => r.status === 'running' || r.status === 'starting')
  const activeId = /^\/session\/([^/]+)/.exec(path)?.[1]
  const sessionTitle = activeId ? c.sessions.find(s => s.id === activeId)?.title : undefined
  const title = `${pending ? `(${pending}) ` : running ? '● ' : ''}${sessionTitle ? `${sessionTitle} · ` : ''}itsvibes`
  useEffect(() => {
    document.title = title
  }, [title])

  const toast = c.toast
  return (
    <>
      <style>{CSS}</style>
      {!c.ready ? <div className="iv-center">Memuat…</div> : (
        <div className="iv-app">
          {c.paired && ui.sidebarOpen ? <Sidebar /> : null}
          <main className="iv-main" style={{ flexDirection: 'column' }}>
            {c.conn === 'unauthorized' ? (
              <div className="iv-banner err">
                Token browser ini tidak berlaku lagi (mungkin dicabut).
                <button className="iv-btn" onClick={() => void c.logout().then(() => router.replace('/pair'))}>Pasangkan ulang</button>
              </div>
            ) : null}
            <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>{children}</div>
          </main>
        </div>
      )}
      {ui.panelOpen ? <UsagePanel id={activeId} /> : null}
      {ui.settings ? <SettingsDialog /> : null}
      {ui.shortcuts ? <ShortcutsDialog /> : null}
      {toast ? <div className="iv-toast" role="status">{toast}</div> : null}
    </>
  )
}
