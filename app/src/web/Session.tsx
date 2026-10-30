import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChatItem } from '../../../shared/protocol'
import { useClient } from '../lib/client'
import { groupItems } from '../lib/group'
import Composer from './Composer'
import Markdown from './Markdown'
import RequestCard from './RequestCard'
import ToolBlock from './ToolBlock'
import { I, copyText, setUI, useUI } from './ui'
import { useAttach, useDrop } from './useAttach'

const EMPTY: ChatItem[] = []

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
  const status = run?.status ?? summary?.status ?? 'closed'
  const busy = status === 'running' || status === 'starting' || status === 'waiting'
  const items = chat?.items ?? EMPTY
  const { nodes, results } = useMemo(() => groupItems(items), [items])

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

  return (
    <>
      <div className="iv-col" {...bind}>
        {!ui.sidebarOpen ? <button className="iv-icon-btn iv-side-show" onClick={() => setUI({ sidebarOpen: true })} title="Tampilkan sidebar (Ctrl+B)"><I n="sidebar" /></button> : null}

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
    </>
  )
}
