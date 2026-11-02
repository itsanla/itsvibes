import { useEffect, useRef, useState } from 'react'
import type { BrowserClientMsg, BrowserServerMsg, BrowserTab } from '../../../shared/protocol'
import { useClient } from '../lib/client'
import { I } from './ui'

// Layar browser bersama (Chromium di Bima) yang sedang dipakai Claude. Frame datang sebagai JPEG biner lewat
// /ws/browser, klik dan ketikan dari sini diteruskan ke tab yang sama, jadi Aan bisa ikut login atau mengambil alih.

const VK: Record<string, number> = {
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, ' ': 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Insert: 45, Delete: 46,
}
// kode tombol Windows dari e.code, supaya tanda baca tidak salah jadi Delete (.) atau PageUp (!)
const OEM: Record<string, number> = {
  Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190, Slash: 191, Backquote: 192,
  BracketLeft: 219, Backslash: 220, BracketRight: 221, Quote: 222, IntlBackslash: 226,
}
const vkOf = (e: { key: string; code: string }): number | undefined => {
  if (VK[e.key] !== undefined) return VK[e.key]
  if (/^F\d+$/.test(e.key)) return 111 + Number(e.key.slice(1))
  if (/^Key[A-Z]$/.test(e.code)) return e.code.charCodeAt(3)
  if (/^Digit\d$/.test(e.code)) return e.code.charCodeAt(5)
  if (/^Numpad\d$/.test(e.code)) return 96 + Number(e.code[6])
  if (OEM[e.code] !== undefined) return OEM[e.code]
  return e.key.length === 1 && /[a-z0-9]/i.test(e.key) ? e.key.toUpperCase().charCodeAt(0) : undefined
}
// pintasan penyuntingan yang tidak otomatis jalan lewat keyDown biasa di Chromium tanpa OS clipboard
const EDIT_CMD: Record<string, string> = { a: 'selectAll', z: 'undo', y: 'redo', x: 'cut', c: 'copy' }

const mods = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) =>
  (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0)

export default function BrowserView({ from }: { from?: string }) {
  const c = useClient()
  const canvas = useRef<HTMLCanvasElement>(null)
  const typer = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const meta = useRef({ w: 1920, h: 1080 })
  const [state, setState] = useState<'connecting' | 'off' | 'starting' | 'ready' | 'error'>('connecting')
  const [message, setMessage] = useState('')
  const [tabs, setTabs] = useState<BrowserTab[]>([])
  const [current, setCurrent] = useState<string | null>(null)
  const [pinned, setPinned] = useState(false)
  const [url, setUrl] = useState('')
  const [urlFocus, setUrlFocus] = useState(false)
  const [gotFrame, setGotFrame] = useState(false)
  const [fps, setFps] = useState(0)

  const send = (m: BrowserClientMsg) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m))
  }

  useEffect(() => {
    document.title = 'Browser · itsvibes'
  }, [])

  // sambungan WebSocket; menyambung ulang sendiri kalau putus
  useEffect(() => {
    if (!c.ready || !c.paired) return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let latest: Blob | null = null
    let drawing = false
    let frames = 0
    const fpsTimer = setInterval(() => {
      setFps(frames)
      frames = 0
    }, 1000)

    const draw = async () => {
      if (drawing) return
      drawing = true
      while (latest) {
        const blob = latest
        latest = null
        try {
          const bmp = await createImageBitmap(blob)
          const cv = canvas.current
          if (cv) {
            if (cv.width !== bmp.width || cv.height !== bmp.height) {
              cv.width = bmp.width
              cv.height = bmp.height
            }
            cv.getContext('2d')?.drawImage(bmp, 0, 0)
            frames++
            setGotFrame(true)
          }
          bmp.close()
        } catch {
          // frame rusak dilewati
        }
      }
      drawing = false
    }

    const open = () => {
      if (stop) return
      setState('connecting')
      const ws = new WebSocket(`${c.url.replace(/^http/, 'ws')}/ws/browser?token=${encodeURIComponent(c.token)}`)
      ws.binaryType = 'blob'
      wsRef.current = ws
      ws.onmessage = ev => {
        if (typeof ev.data !== 'string') {
          latest = new Blob([ev.data as Blob], { type: 'image/jpeg' })
          void draw()
          return
        }
        const m = JSON.parse(ev.data) as BrowserServerMsg
        if (m.t === 'status') {
          setState(m.state)
          setMessage(m.message)
        } else if (m.t === 'tabs') {
          setTabs(m.tabs)
          setCurrent(m.current)
          setPinned(m.pinned)
        } else if (m.t === 'meta') meta.current = { w: m.w, h: m.h }
      }
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null
        if (stop) return
        setState('connecting')
        timer = setTimeout(open, 1500)
      }
    }
    open()
    return () => {
      stop = true
      clearTimeout(timer)
      clearInterval(fpsTimer)
      wsRef.current?.close()
    }
  }, [c.ready, c.paired, c.url, c.token])

  const tab = tabs.find(t => t.id === current)
  useEffect(() => {
    if (!urlFocus) setUrl(tab?.url === 'about:blank' ? '' : tab?.url ?? '')
  }, [tab?.url, urlFocus])

  // ---------- masukan ----------

  const point = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: Math.round(((e.clientX - r.left) / r.width) * meta.current.w), y: Math.round(((e.clientY - r.top) / r.height) * meta.current.h) }
  }
  const BTN = ['left', 'middle', 'right'] as const

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    // roda harus non-pasif supaya halaman ini tidak ikut tergulir
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const k = e.deltaMode === 1 ? 40 : 1
      send({ t: 'mouse', type: 'wheel', ...point(e), dx: e.deltaX * k, dy: e.deltaY * k, mod: mods(e) })
    }
    cv.addEventListener('wheel', wheel, { passive: false })
    return () => cv.removeEventListener('wheel', wheel)
  }, [gotFrame])

  const moveQueued = useRef(false)
  const down = (e: React.PointerEvent) => {
    e.preventDefault()
    typer.current?.focus({ preventScroll: true })
    ;(e.target as Element).setPointerCapture(e.pointerId)
    send({ t: 'mouse', type: 'mousePressed', ...point(e), button: BTN[e.button] ?? 'left', buttons: e.buttons, clicks: e.detail || 1, mod: mods(e) })
  }
  const up = (e: React.PointerEvent) => {
    send({ t: 'mouse', type: 'mouseReleased', ...point(e), button: BTN[e.button] ?? 'left', buttons: e.buttons, clicks: e.detail || 1, mod: mods(e) })
  }
  const move = (e: React.PointerEvent) => {
    if (moveQueued.current) return
    moveQueued.current = true
    const p = point(e)
    const m = mods(e)
    const buttons = e.buttons
    requestAnimationFrame(() => {
      moveQueued.current = false
      send({ t: 'mouse', type: 'mouseMoved', ...p, button: buttons & 1 ? 'left' : 'none', buttons, mod: m })
    })
  }

  const keyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.key === 'Unidentified' || e.keyCode === 229) return // teks dari keyboard HP ditangani onInput
    const mod = mods(e)
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.key.toLowerCase() === 'v') return // tempel ditangani onPaste
    const printable = e.key.length === 1 && !ctrl
    if (!printable && !(e.key in VK) && !/^F\d+$/.test(e.key) && !ctrl) return
    e.preventDefault()
    const lower = e.key.toLowerCase()
    const commands = ctrl ? (e.shiftKey && lower === 'z' ? ['redo'] : EDIT_CMD[lower] ? [EDIT_CMD[lower]] : undefined) : undefined
    const vk = vkOf(e)
    const text = e.key === 'Enter' ? '\r' : printable ? e.key : undefined
    send({ t: 'key', type: text ? 'keyDown' : 'rawKeyDown', key: e.key, code: e.code, text, vk, mod, repeat: e.repeat, commands })
  }
  const keyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.key === 'Unidentified' || e.keyCode === 229) return
    const vk = vkOf(e)
    send({ t: 'key', type: 'keyUp', key: e.key, code: e.code, vk, mod: mods(e) })
  }
  const onInput = (e: React.FormEvent<HTMLInputElement>) => {
    const el = e.currentTarget
    if (el.value) send({ t: 'text', text: el.value })
    el.value = ''
  }
  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text')
    if (text) {
      e.preventDefault()
      send({ t: 'text', text })
    }
  }

  const live = state === 'ready' && gotFrame
  return (
    <div className="iv-br">
      <div className="iv-br-top">
        <a className="iv-icon-btn" href={from ? `/session/${from}` : '/'} title="Kembali ke itsvibes"><I n="arrowLeft" /></a>
        <div className="iv-br-tabs">
          {tabs.map(t => (
            <div key={t.id} className={`iv-br-tab${t.id === current ? ' on' : ''}`} onClick={() => send({ t: 'select', id: t.id })} title={t.url}>
              <span className="n">{t.title || t.url || 'Tab baru'}</span>
              {t.active ? <i className="iv-dot run" title="Tab yang sedang dipakai" /> : null}
              <button className="x" onClick={e => { e.stopPropagation(); send({ t: 'closetab', id: t.id }) }} aria-label="Tutup tab"><I n="close" s={12} /></button>
            </div>
          ))}
          <button className="iv-icon-btn" onClick={() => send({ t: 'newtab' })} title="Tab baru"><I n="plus" s={16} /></button>
        </div>
        <button className={`iv-br-follow${pinned ? '' : ' on'}`} onClick={() => send({ t: 'select', id: null })} title="Otomatis berpindah ke tab yang dipakai Claude">
          {pinned ? 'Tab dikunci' : 'Ikuti Claude'}
        </button>
        <span className={`iv-dot ${state === 'ready' ? 'ok' : state === 'error' ? 'err' : 'warn'}`} title={state} />
      </div>
      <div className="iv-br-bar">
        <button className="iv-icon-btn" onClick={() => send({ t: 'history', dir: 'back' })} title="Kembali"><I n="arrowLeft" s={16} /></button>
        <button className="iv-icon-btn" onClick={() => send({ t: 'history', dir: 'forward' })} title="Maju"><I n="arrowRight" s={16} /></button>
        <button className="iv-icon-btn" onClick={() => send({ t: 'reload' })} title="Muat ulang"><I n="refresh" s={16} /></button>
        <input
          className="iv-br-url" value={url} placeholder="Ketik alamat atau kata pencarian" spellCheck={false}
          onChange={e => setUrl(e.target.value)} onFocus={e => { setUrlFocus(true); e.target.select() }} onBlur={() => setUrlFocus(false)}
          onKeyDown={e => { if (e.key === 'Enter' && url.trim()) { send({ t: 'nav', url: url.trim() }); e.currentTarget.blur() } }}
        />
        <button className="iv-icon-btn" onClick={() => typer.current?.focus()} title="Tampilkan keyboard"><I n="keyboard" s={16} /></button>
        <span className="iv-br-fps">{live ? `${fps} fps` : ''}</span>
      </div>
      <div className="iv-br-stage">
        <canvas
          ref={canvas} className="iv-br-canvas" style={{ visibility: gotFrame ? 'visible' : 'hidden' }}
          onPointerDown={down} onPointerUp={up} onPointerMove={move} onContextMenu={e => e.preventDefault()}
        />
        <input
          ref={typer} className="iv-br-typer" autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
          onKeyDown={keyDown} onKeyUp={keyUp} onInput={onInput} onPaste={onPaste}
        />
        {!live ? (
          <div className="iv-br-note">
            {state === 'error' ? <><b>Browser gagal menyala</b><span>{message}</span></>
              : state === 'ready' ? <><span className="iv-spin" style={{ display: 'inline-block' }} /> Menunggu layar…</>
                : <><span className="iv-spin" style={{ display: 'inline-block' }} /> {state === 'starting' ? 'Menyalakan browser…' : 'Menyambung…'}</>}
          </div>
        ) : null}
      </div>
    </div>
  )
}
