import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChatItem } from '../../../shared/protocol'
import { useClient } from '../lib/client'
import { MODES, STATUS, liveLine, shortPath } from '../lib/format'
import { groupItems } from '../lib/group'
import Composer from './Composer'
import Markdown from './Markdown'
import RequestCard from './RequestCard'
import ToolBlock from './ToolBlock'
import UsagePanel, { Ring } from './UsagePanel'
import { I, Popover, copyText, setUI, useUI } from './ui'
import { useAttach, useDrop } from './useAttach'

const EMPTY: ChatItem[] = []

// folder panjang dipotong dari kiri supaya nama folder terakhir tetap terlihat
const folderLabel = (cwd: string) => {
  const p = shortPath(cwd)
  return p.length > 34 ? `…${p.slice(-33)}` : p
}

function Message({ item }: { item: ChatItem }) {
  const [done, setDone] = useState(false)
  switch (item.k) {
    case 'user':
      return (
        <div className="iv-msg user">
          <div className="iv-user">
            {item.text}
            {item.images ? <small>{item.images} gambar</small> : null}
          </div>
        </div>
      )
    case 'assistant':
      return (
        <div className="iv-msg">
          <button
            className="iv-copy"
            title="Salin jawaban"
            onClick={() => {
              copyText(item.text)
              setDone(true)
              setTimeout(() => setDone(false), 1500)
            }}
          >
            <I n={done ? 'check' : 'copy'} s={15} />
          </button>
          <Markdown text={item.text} />
        </div>
      )
    case 'thinking':
      return (
        <details className="iv-think">
          <summary>Berpikir… {item.text.replace(/\s+/g, ' ').slice(0, 90)}</summary>
          <div>{item.text}</div>
        </details>
      )
    case 'system':
      return <div className="iv-sys">{item.text}</div>
    default:
      return null
  }
}

const statusPill = (status: string) => {
  const st = STATUS[status as keyof typeof STATUS]
  const cls = status === 'idle' ? 'ok' : status === 'waiting' ? 'warn' : status === 'running' || status === 'starting' ? 'run' : status === 'terminal' ? 'blue' : ''
  return { label: st?.label || 'Tidak berjalan', cls }
}

export default function SessionView({ id }: { id: string }) {
  const c = useClient()
  const ui = useUI()
  const [text, setText] = useState('')
  const att = useAttach()
  const { drag, bind } = useDrop(att.add)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const prevHeight = useRef(0)
  const [atBottom, setAtBottom] = useState(true)

  const chat = c.chats.get(id)
  const run = c.runs.get(id)
  const summary = c.sessions.find(x => x.id === id)
  const usage = c.usage.get(id)
  const status = run?.status ?? summary?.status ?? 'closed'
  const busy = status === 'running' || status === 'starting' || status === 'waiting'
  const items = chat?.items ?? EMPTY
  const { nodes, results } = useMemo(() => groupItems(items), [items])
  const pill = statusPill(status)

  // pasang langganan sesi ini; dipanggil ulang kalau pindah sesi (komponen diberi key=id)
  useLayoutEffect(() => {
    c.openChat(id)
    return () => c.closeChat(id)
  }, [c, id])

  // tetap menempel di bawah saat pesan baru atau teks mengalir; riwayat lama yang dimuat di atas tidak menggeser tampilan
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (prevHeight.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current
      prevHeight.current = 0
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight
    }
  })

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    stick.current = near
    setAtBottom(near)
    if (el.scrollTop < 200 && chat?.loaded && !chat.loading && chat.before !== null) {
      prevHeight.current = el.scrollHeight
      void c.loadHistory(id, true)
    }
  }
  const toBottom = () => {
    stick.current = true
    setAtBottom(true)
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }

  const canSend = !!text.trim() || att.items.length > 0
  const send = () => {
    if (!canSend) return
    stick.current = true
    c.send(text.trim(), { sessionId: id, images: att.items }).then(
      () => {
        setText('')
        att.clear()
      },
      e => c.showToast(e instanceof Error ? e.message : String(e)),
    )
  }
  const mode = MODES.find(m => m.mode === run?.mode)
  const active = !!run && run.status !== 'closed'

  return (
    <>
      <div className="iv-col" {...bind}>
        <header className="iv-head">
          {!ui.sidebarOpen ? <button className="iv-icon-btn" onClick={() => setUI({ sidebarOpen: true })} title="Tampilkan sidebar (Ctrl+B)"><I n="sidebar" /></button> : null}
          <div className="iv-head-title" title={summary?.title}>{summary?.title ?? 'Sesi'}</div>
          <span className={`iv-pill ${pill.cls}`}>{pill.label}</span>
          {summary?.cwd ? <span className="iv-pill shrink" title={summary.cwd}><I n="folder" s={13} /> <span>{folderLabel(summary.cwd)}</span></span> : null}
          <div className="iv-spacer" />
          <Popover
            dir="down"
            right
            trigger={(_, toggle) => (
              <button className="iv-chip" onClick={toggle} title="Mode izin"><I n="shield" s={15} /><span>{mode?.label ?? 'Mode izin'}</span><I n="chevronDown" s={14} /></button>
            )}
          >
            {close => (
              <>
                <div className="iv-pop-title">Mode izin</div>
                {active ? MODES.map(m => (
                  <button key={m.mode} className="iv-pop-item" onClick={() => { c.setMode(id, m.mode); close() }}>
                    <span><span className="n">{m.label}</span><small>{m.hint}</small></span>
                    {run?.mode === m.mode ? <span className="ck"><I n="check" s={18} w={2.2} /></span> : null}
                  </button>
                )) : <div style={{ padding: '6px 10px 8px', color: 'var(--dim)', fontSize: 13 }}>Mode bisa diubah setelah sesi berjalan. Kirim pesan untuk melanjutkannya.</div>}
              </>
            )}
          </Popover>
          <button className={`iv-chip${ui.panelOpen ? '' : ''}`} onClick={() => setUI({ panelOpen: !ui.panelOpen })} title="Kuota 5 jam, kuota mingguan, token konteks (Ctrl+\)">
            <Ring percent={usage?.context?.percentage ?? null} />
            <span>{liveLine(c.plan, c.tokens.get(id)) || 'Konteks'}</span>
          </button>
          <Popover
            dir="down"
            right
            trigger={(_, toggle) => <button className="iv-icon-btn" onClick={toggle} title="Lainnya"><I n="dots" /></button>}
          >
            {close => (
              <>
                {active ? <button className="iv-pop-item" onClick={() => { c.stop(id); close() }} style={{ color: 'var(--err)' }}><span className="n">Hentikan proses sesi ini</span></button> : null}
                <button className="iv-pop-item" onClick={() => { copyText(`claude --resume ${id}`); c.showToast('Perintah resume disalin'); close() }}><span><span className="n">Salin perintah claude --resume</span></span></button>
                <button className="iv-pop-item" onClick={() => { copyText(id); c.showToast('ID sesi disalin'); close() }}><span><span className="n">Salin ID sesi</span><small>{id}</small></span></button>
                <button className="iv-pop-item" onClick={() => { void c.loadHistory(id); close() }}><span><span className="n">Muat ulang riwayat</span></span></button>
              </>
            )}
          </Popover>
        </header>

        {status === 'terminal' ? <div className="iv-banner">Sesi ini sedang terbuka di terminal Bima. Tutup di sana dulu untuk melanjutkannya dari sini.</div> : null}

        <div className="iv-scroll" ref={scroller} onScroll={onScroll}>
          <div className="iv-stream">
            {chat?.loading ? <div className="iv-top-note"><span className="iv-spin" style={{ display: 'inline-block' }} /> Memuat riwayat…</div> : chat?.loaded && chat.before === null ? <div className="iv-top-note">Awal sesi</div> : null}
            {nodes.map((n, i) => n.kind === 'tools'
              ? <ToolBlock key={n.tools[0].id} tools={n.tools} results={results} running={busy} />
              : <Message key={n.item.id + i} item={n.item} />)}
            {chat?.streaming ? <div className="iv-msg"><Markdown text={chat.streaming} /></div>
              : busy && !run?.pending.length ? <div className="iv-working"><span className="iv-dots"><span /><span /><span /></span> Claude bekerja…</div> : null}
            {(run?.pending ?? []).map(p => <RequestCard key={p.id} req={p} onAnswer={a => c.answer(a)} />)}
          </div>
        </div>

        {!atBottom ? <button className="iv-jump" onClick={toBottom}><I n="arrowDown" s={14} /> Ke pesan terbaru</button> : null}

        <div className="iv-compose-wrap">
          <Composer
            value={text}
            onChange={setText}
            onSend={send}
            onStop={() => c.interrupt(id)}
            busy={busy}
            canSend={canSend}
            placeholder={status === 'closed' ? 'Kirim pesan untuk melanjutkan sesi ini' : 'Pesan untuk Claude'}
            drag={drag}
            models={c.models}
            model={run?.model}
            effort={run?.effort}
            onModel={v => c.setModel(id, v)}
            onEffort={v => c.setEffort(id, v)}
            attach={att.items}
            attachBusy={att.busy}
            onFiles={att.add}
            onRemoveAttach={att.remove}
          />
          <div className="iv-hint">Enter kirim · Shift+Enter baris baru · Ctrl+V tempel gambar · Esc hentikan · <button className="iv-tools-head" style={{ padding: 0, display: 'inline' }} onClick={() => setUI({ shortcuts: true })}>pintasan</button></div>
        </div>
        {drag ? <div className="iv-dropmask">Lepas gambar untuk melampirkan</div> : null}
      </div>
      {ui.panelOpen ? (
        <UsagePanel usage={usage} loading={c.usageLoading} running={busy} onRefresh={() => c.requestUsage(id)} onClose={() => setUI({ panelOpen: false })} />
      ) : null}
    </>
  )
}
