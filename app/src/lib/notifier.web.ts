import { router } from 'expo-router'
import type { ItsvibesNotifier } from '../../modules/itsvibes-notifier'

export type { ItsvibesNotifier, NotifierStatus } from '../../modules/itsvibes-notifier'

// Notifikasi versi web: WebSocket role=notifier yang sama dengan service Android, lalu ditampilkan lewat
// Notification API browser. Berjalan selama tab itsvibes terbuka (termasuk di latar belakang).
const KEY = 'itsvibes.notifier'

const read = () => {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let enabled = read()
let cfg: { url: string; token: string } | null = null
let ws: WebSocket | null = null
let connected = false
let timer: ReturnType<typeof setTimeout> | null = null
let backoff = 2000

function show(m: { sessionId: string; title: string; body: string }) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const n = new Notification(m.title, { body: m.body, tag: m.sessionId, icon: '/favicon.ico' })
  n.onclick = () => {
    window.focus()
    router.push(`/session/${m.sessionId}`)
    n.close()
  }
}

function connect() {
  if (!enabled || !cfg || ws) return
  const sock = new WebSocket(`${cfg.url.replace(/^http/, 'ws')}/ws?role=notifier&token=${encodeURIComponent(cfg.token)}`)
  ws = sock
  sock.onopen = () => {
    connected = true
    backoff = 2000
  }
  sock.onmessage = e => {
    try {
      const m = JSON.parse(String(e.data))
      if (m.t === 'notify') show(m)
    } catch {
      // pesan tidak dikenal
    }
  }
  sock.onclose = () => {
    if (ws !== sock) return
    ws = null
    connected = false
    if (!enabled) return
    timer = setTimeout(connect, backoff)
    backoff = Math.min(backoff * 2, 60_000)
  }
  sock.onerror = () => undefined
}

const Notifier: ItsvibesNotifier = {
  start(url, token) {
    cfg = { url, token }
    enabled = true
    try {
      window.localStorage.setItem(KEY, '1')
    } catch {
      // mode privat: tetap aktif selama tab terbuka
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission()
    connect()
    return true
  },
  stop() {
    enabled = false
    try {
      window.localStorage.setItem(KEY, '0')
    } catch {
      // abaikan
    }
    if (timer) clearTimeout(timer)
    timer = null
    const sock = ws
    ws = null
    connected = false
    sock?.close()
    return true
  },
  status: () => ({ enabled, running: enabled, connected }),
  isIgnoringBatteryOptimizations: () => true,
  requestIgnoreBatteryOptimizations: () => undefined,
}

export default Notifier as ItsvibesNotifier | null
