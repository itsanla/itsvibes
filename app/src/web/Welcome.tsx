import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import type { EffortLevel } from '../../../shared/protocol'
import { useClient } from '../lib/client'
import { shortPath } from '../lib/format'
import { modelsFor } from '../lib/models'
import Composer from './Composer'
import SessionTools from './SessionTools'
import { I, Popover, setUI, useUI } from './ui'
import { useAttach, useDrop } from './useAttach'

// Layar awal dan "Sesi baru": kolom ketik besar di tengah, folder kerja bawaan ~ (home Bima) bisa diganti
export default function Welcome() {
  const c = useClient()
  const ui = useUI()
  const att = useAttach()
  const { drag, bind } = useDrop(att.add)
  const [text, setText] = useState('')
  const [model, setModel] = useState<string>()
  const [effort, setEffort] = useState<EffortLevel>()
  const [cwd, setCwd] = useState<string>()
  const [dirs, setDirs] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    c.requestModels()
  }, [c])

  const canSend = (!!text.trim() || att.items.length > 0) && !busy
  const start = async () => {
    setBusy(true)
    try {
      const id = await c.send(text.trim(), { images: att.items, model: model === 'default' ? undefined : model, effort, cwd })
      router.push(`/session/${id}`)
    } catch (e) {
      c.showToast(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const folder = (
    <Popover
      dir="up"
      trigger={(open, toggle) => (
        <button
          className="iv-chip"
          title="Folder kerja"
          onClick={() => {
            if (!open) c.cwds().then(setDirs, () => undefined)
            toggle()
          }}
        >
          <I n="folder" s={15} /><span>{cwd ? shortPath(cwd) : '~'}</span><I n="chevronDown" s={14} />
        </button>
      )}
    >
      {close => (
        <>
          <div className="iv-pop-title">Folder kerja</div>
          <input className="iv-pop-search" autoFocus placeholder="Cari folder" value={q} onChange={e => setQ(e.target.value)} />
          <button className="iv-pop-item" onClick={() => { setCwd(undefined); close() }}><span><span className="n">~ (home Bima)</span><small>bawaan</small></span>{!cwd ? <span className="ck"><I n="check" s={18} w={2.2} /></span> : null}</button>
          {dirs.filter(d => !q || d.toLowerCase().includes(q.toLowerCase())).slice(0, 80).map(d => (
            <button key={d} className="iv-pop-item" onClick={() => { setCwd(d); close() }}>
              <span className="n" style={{ fontWeight: 500, wordBreak: 'break-all' }}>{shortPath(d)}</span>
              {cwd === d ? <span className="ck"><I n="check" s={18} w={2.2} /></span> : null}
            </button>
          ))}
        </>
      )}
    </Popover>
  )

  return (
    <div className="iv-col" {...bind}>
      <header className="iv-head" style={{ borderBottomColor: 'transparent' }}>
        {!ui.sidebarOpen ? <button className="iv-icon-btn" onClick={() => setUI({ sidebarOpen: true })} title="Tampilkan sidebar (Ctrl+B)"><I n="sidebar" /></button> : null}
      </header>
      <div className="iv-welcome">
        <h1>Mau mengerjakan apa di Bima?</h1>
        <p className="sub">Claude Code berjalan langsung di server Bima, dengan folder proyek, memory, dan skill yang sama seperti di terminal.</p>
        <div className="iv-compose-wrap" style={{ maxWidth: 820 }}>
          <Composer
            value={text}
            onChange={setText}
            onSend={start}
            busy={false}
            canSend={canSend}
            placeholder="Tulis pesan pertama untuk Claude"
            autoFocus
            drag={drag}
            models={modelsFor(c.models, c.settings?.source)}
            model={model}
            effort={effort}
            onModel={setModel}
            onEffort={v => setEffort(v === 'default' ? undefined : v)}
            attach={att.items}
            attachBusy={att.busy}
            onFiles={att.add}
            onRemoveAttach={att.remove}
            extra={<>{folder}<SessionTools /></>}
          />
          <div className="iv-hint">{busy ? 'Memulai sesi…' : 'Enter kirim · Shift+Enter baris baru · Ctrl+V tempel gambar'}</div>
        </div>
      </div>
      {drag ? <div className="iv-dropmask">Lepas gambar untuk melampirkan</div> : null}
    </div>
  )
}
