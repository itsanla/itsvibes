import { useState } from 'react'
import type { Tool, ToolResult } from '../lib/group'
import { useEffect } from 'react'
import { useClient } from '../lib/client'
import { isBrowserTool, kindOf, summarize, toolLabel } from '../lib/tools'
import { CodeBlock } from './Markdown'
import { Drawer, I } from './ui'

// Edit/Write dengan input utuh (belum terpotong) ditampilkan sebagai diff merah/hijau
function parseEdit(t: Tool): { path?: string; del: string; add: string } | null {
  if (!/^(Edit|Write)$/.test(t.name)) return null
  try {
    const j = JSON.parse(t.input) as Record<string, unknown>
    if (t.name === 'Edit' && typeof j.old_string === 'string' && typeof j.new_string === 'string') {
      return { path: String(j.file_path ?? ''), del: j.old_string, add: j.new_string }
    }
    if (t.name === 'Write' && typeof j.content === 'string') return { path: String(j.file_path ?? ''), del: '', add: j.content }
  } catch {
    // input terpotong: tampil sebagai teks biasa
  }
  return null
}

function Diff({ del, add }: { del: string; add: string }) {
  return (
    <div className="iv-pre">
      <pre>
        {del ? del.split('\n').map((l, i) => <div key={`d${i}`} className="iv-dl d">{`- ${l}`}</div>) : null}
        {add.split('\n').map((l, i) => <div key={`a${i}`} className="iv-dl a">{`+ ${l}`}</div>)}
      </pre>
    </div>
  )
}

function Step({ t, r, running }: { t: Tool; r?: ToolResult; running: boolean }) {
  const [open, setOpen] = useState(false)
  const k = kindOf(t.name)
  const failed = !!r?.isError
  const pending = !r && running
  const edit = open ? parseEdit(t) : null
  return (
    <div className="iv-step">
      <button className={`iv-step-head${k.file ? ' file' : ''}${failed ? ' err' : ''}`} onClick={() => setOpen(true)}>
        <I n={k.icon} s={16} />
        <b>{failed ? 'Gagal' : pending ? k.doing : k.done}</b>
        <span className="t">{toolLabel(t)}</span>
        {t.added !== undefined || t.removed !== undefined ? (
          <span className="iv-diff"><i className="a">+{t.added ?? 0}</i><i className="d">-{t.removed ?? 0}</i></span>
        ) : null}
        {pending ? <span className="iv-spin" /> : null}
      </button>
      {open ? (
        <Drawer wide title={failed ? 'Gagal' : pending ? k.doing : k.done} sub={toolLabel(t)} onClose={() => setOpen(false)}>
          <div className="iv-wrap">
            {edit ? <Diff del={edit.del} add={edit.add} /> : <CodeBlock lang={/^(Bash|PowerShell)$/.test(t.name) ? 'perintah' : 'masukan'} text={t.detail ?? t.input} />}
            {r ? <CodeBlock lang={failed ? 'galat' : 'keluaran'} text={r.text || '(tanpa keluaran)'} err={failed} /> : pending ? <div className="iv-wait"><span className="iv-spin" /> Menunggu keluaran…</div> : null}
          </div>
        </Drawer>
      ) : null}
    </div>
  )
}

// Kartu browser: pratinjau layar Chromium bersama selama Claude memakainya; klik membuka layar penuh di tab baru
function BrowserCard({ sessionId, busy, last }: { sessionId?: string; busy: boolean; last: string }) {
  const c = useClient()
  const [src, setSrc] = useState('')
  useEffect(() => {
    if (!busy) return
    let stop = false
    let prev = ''
    const tick = async () => {
      try {
        const r = await fetch(`${c.url}/api/browser/snapshot`, { headers: { authorization: `Bearer ${c.token}` } })
        if (r.ok && !stop) {
          const u = URL.createObjectURL(await r.blob())
          setSrc(u)
          if (prev) URL.revokeObjectURL(prev)
          prev = u
        }
      } catch {
        // pratinjau dilewati sekali
      }
    }
    void tick()
    const iv = setInterval(() => void tick(), 1200)
    return () => {
      stop = true
      clearInterval(iv)
      if (prev) URL.revokeObjectURL(prev)
    }
  }, [busy, c.url, c.token])
  const href = `/browser${sessionId ? `?s=${sessionId}` : ''}`
  return (
    <a className={`iv-bcard${busy ? ' live' : ''}`} href={href} target="_blank" rel="noopener">
      {busy && src ? <img src={src} alt="" draggable={false} /> : null}
      <span className="iv-bcard-bar">
        <I n="globe" s={16} />
        <b>{busy ? 'Browser sedang dipakai' : 'Browser'}</b>
        <span className="t">{last}</span>
        {busy ? <span className="iv-dot run" /> : null}
        <span className="open">Buka layar penuh <I n="external" s={13} /></span>
      </span>
    </a>
  )
}

// Rangkaian langkah tool yang berurutan: satu baris ringkasan, klik untuk membuka rincian langkah
export default function ToolBlock({ tools, results, running, sessionId }: { tools: Tool[]; results: Map<string, ToolResult>; running: boolean; sessionId?: string }) {
  const [open, setOpen] = useState(false)
  const busy = running && tools.some(t => !results.has(t.id))
  const browserTools = tools.filter(t => isBrowserTool(t.name))
  return (
    <div className="iv-tools">
      {browserTools.length ? <BrowserCard sessionId={sessionId} busy={busy} last={toolLabel(browserTools[browserTools.length - 1])} /> : null}
      <button className="iv-tools-head" onClick={() => setOpen(o => !o)}>
        <span className={`iv-chev${open ? ' open' : ''}`}><I n="chevronRight" s={14} /></span>
        <span>{summarize(tools)}</span>
        {busy ? <span className="iv-spin" /> : null}
      </button>
      {open ? <div className="iv-steps">{tools.map(t => <Step key={t.id} t={t} r={results.get(t.id)} running={running} />)}</div> : null}
    </div>
  )
}
