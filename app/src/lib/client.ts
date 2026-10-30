import { useSyncExternalStore } from 'react'
import { AppState, PermissionsAndroid, Platform } from 'react-native'
import Notifier from './notifier'
import { storage } from './storage'
import type {
  AiSettings, Answer, ChatItem, ClientMessage, ContextInfo, EffortLevel, HistoryPage, ImageAttachment, ModelOption, PendingRequest,
  PermissionMode, PlanInfo, ServerMessage, SessionStatus, SessionSummary, SourceId,
} from '../../../shared/protocol'

// Satu koneksi WebSocket ke itsvibes-server untuk seluruh aplikasi. Layar membaca state lewat useClient().

export interface Chat {
  items: ChatItem[]
  before: number | null
  loading: boolean
  loaded: boolean
  streaming: string
  queued: ChatItem[] // event yang datang saat riwayat sedang dimuat
}

export interface RunState { status: SessionStatus; mode?: PermissionMode; pending: PendingRequest[]; model?: string; effort?: EffortLevel }
export interface Usage { context: ContextInfo | null; plan: PlanInfo | null; at: number }
export type Conn = 'none' | 'connecting' | 'online' | 'offline' | 'unauthorized'

// di web, aplikasi dilayani server itsvibes sendiri, jadi alamatnya sama dengan halaman yang dibuka
export const DEFAULT_URL =
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'https://itsvibes.anla.my.id'
const KEY = 'itsvibes.config'

const newChat = (): Chat => ({ items: [], before: null, loading: false, loaded: false, streaming: '', queued: [] })

class Client {
  url = DEFAULT_URL
  token = ''
  ready = false
  conn: Conn = 'none'
  sessions: SessionSummary[] = []
  sessionsLoading = false
  private lastRefresh = 0
  showAutomated = false
  runs = new Map<string, RunState>()
  chats = new Map<string, Chat>()
  models: ModelOption[] = []
  usage = new Map<string, Usage>() // kunci '' = kuota paket tanpa sesi
  usageLoading = false
  settings: AiSettings | null = null
  plan: PlanInfo | null = null // kuota sumber aktif, diperbarui server secara berkala
  tokens = new Map<string, number>() // token konteks per sesi, diperbarui selama Claude menjawab
  toast: string | null = null

  private ws: WebSocket | null = null
  private retry = 1000
  private timer: ReturnType<typeof setTimeout> | null = null
  private version = 0
  private listeners = new Set<() => void>()
  private waiters = new Map<string, { resolve: (id: string) => void; reject: (e: Error) => void }>()
  private open = new Set<string>()
  private focusId: string | null = null
  private toastTimer: ReturnType<typeof setTimeout> | null = null

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  getVersion = () => this.version

  private changed() {
    this.version++
    for (const l of this.listeners) l()
  }

  get paired() {
    return !!this.token
  }

  private initP: Promise<void> | null = null

  // Aman dipanggil berulang dan dari mana saja: layar yang terpasang lebih dulu dari RootLayout (misalnya saat
  // halaman sesi dibuka langsung lewat tautan atau notifikasi) menunggu token terbaca dulu sebelum memanggil API.
  init(): Promise<void> {
    return (this.initP ??= this.doInit())
  }

  private async doInit() {
    try {
      const raw = await storage.get(KEY)
      if (raw) Object.assign(this, JSON.parse(raw) as { url: string; token: string })
    } catch {
      // penyimpanan aman kosong atau rusak: anggap belum dipasangkan
    }
    this.ready = true
    this.changed()
    AppState.addEventListener('change', s => {
      const active = s === 'active'
      this.sendFocus()
      if (active && this.paired) {
        if (this.conn !== 'online' && this.conn !== 'connecting') this.connect()
        void this.refreshSessions()
      }
    })
    if (this.paired) {
      this.connect()
      // hanya dinyalakan lagi kalau memang aktif; kalau Aan mematikannya lewat tombol Notif, tetap mati
      if (Notifier?.status().enabled) void this.startNotifier()
      void this.refreshSessions()
    }
  }

  async pair(url: string, code: string, name: string) {
    const base = url.trim().replace(/\/+$/, '')
    const res = await fetch(`${base}/api/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: code.trim(), name }),
    })
    const data = (await res.json().catch(() => ({}))) as { token?: string; error?: string }
    if (!res.ok || !data.token) throw new Error(data.error ?? `Gagal (HTTP ${res.status})`)
    this.url = base
    this.token = data.token
    await storage.set(KEY, JSON.stringify({ url: base, token: data.token }))
    this.connect()
    await this.startNotifier()
    await this.refreshSessions()
  }

  async logout() {
    Notifier?.stop()
    const ws = this.ws
    this.ws = null
    ws?.close()
    if (this.timer) clearTimeout(this.timer)
    this.token = ''
    this.sessions = []
    this.chats.clear()
    this.runs.clear()
    this.open.clear()
    this.conn = 'none'
    await storage.remove(KEY)
    this.changed()
  }

  // mode siaga: service native yang menjaga koneksi untuk notifikasi walau aplikasi ditutup
  async startNotifier() {
    if (!Notifier || !this.paired) return
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS' as never).catch(() => undefined)
    }
    try {
      Notifier.start(this.url, this.token)
    } catch (e) {
      this.showToast(`Mode siaga gagal: ${String(e)}`)
    }
  }

  // tombol notifikasi di layar utama = menyalakan/mematikan mode siaga
  get notifierOn() {
    return !!Notifier?.status().enabled
  }

  async setNotifier(on: boolean) {
    if (on) await this.startNotifier()
    else Notifier?.stop()
    this.changed()
  }

  showToast(text: string) {
    this.toast = text
    if (this.toastTimer) clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => {
      this.toast = null
      this.changed()
    }, 4000)
    this.changed()
  }

  private async api<T>(path: string, method = 'GET'): Promise<T> {
    await this.init()
    if (!this.token) throw new Error('Belum dipasangkan dengan Bima')
    const res = await fetch(this.url + path, { method, headers: { authorization: `Bearer ${this.token}` } })
    if (res.status === 401) {
      this.conn = 'unauthorized'
      this.changed()
      throw new Error('Token tidak berlaku lagi, pasangkan ulang perangkat ini')
    }
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`)
    return (await res.json()) as T
  }

  async refreshSessions() {
    if (!this.paired) return
    this.sessionsLoading = true
    this.lastRefresh = Date.now()
    this.changed()
    try {
      this.sessions = await this.api<SessionSummary[]>(`/api/sessions${this.showAutomated ? '?automated=1' : ''}`)
    } catch (e) {
      this.showToast(e instanceof Error ? e.message : String(e))
    } finally {
      this.sessionsLoading = false
      this.changed()
    }
  }

  setShowAutomated(v: boolean) {
    this.showAutomated = v
    void this.refreshSessions()
  }

  cwds() {
    return this.api<string[]>('/api/cwds')
  }

  // kode pairing 6 digit untuk memasangkan perangkat lain (misalnya browser) tanpa membuka terminal Bima
  async newPairCode(): Promise<string> {
    return (await this.api<{ code: string }>('/api/pair-code', 'POST')).code
  }

  // ---------- WebSocket ----------

  connect() {
    if (!this.paired || this.conn === 'unauthorized') return
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const old = this.ws
    this.ws = null
    old?.close()
    // browser tidak bisa mengirim header pada WebSocket, jadi token dikirim lewat query (server menerima keduanya)
    const url = `${this.url.replace(/^http/, 'ws')}/ws?role=app&token=${encodeURIComponent(this.token)}`
    const ws = new WebSocket(url)
    this.ws = ws
    this.conn = 'connecting'
    this.changed()
    ws.onopen = () => {
      if (this.ws !== ws) return
      this.conn = 'online'
      this.retry = 1000
      this.sendFocus()
      this.raw({ t: 'models' })
      // setelah tersambung ulang: berlangganan lagi dan muat ulang riwayat, supaya tidak ada yang terlewat
      for (const id of this.open) {
        this.raw({ t: 'subscribe', sessionId: id, lastSeq: -1 })
        void this.loadHistory(id)
      }
      this.changed()
    }
    ws.onmessage = e => {
      try {
        this.onMessage(JSON.parse(String(e.data)) as ServerMessage)
      } catch {
        // pesan tidak dikenal
      }
    }
    ws.onclose = () => {
      if (this.ws !== ws) return
      this.ws = null
      if (this.conn !== 'unauthorized') this.conn = 'offline'
      this.changed()
      if (this.conn === 'unauthorized') return
      this.timer = setTimeout(() => {
        // koneksi ditolak bisa berarti token dicabut: cek lewat HTTP supaya tidak mencoba selamanya
        void this.refreshSessions().finally(() => this.connect())
      }, this.retry)
      this.retry = Math.min(this.retry * 2, 30_000)
    }
    ws.onerror = () => undefined
  }

  private raw(m: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(m))
      return true
    }
    return false
  }

  private sendFocus() {
    this.raw({ t: 'focus', sessionId: this.focusId, visible: AppState.currentState === 'active' })
  }

  private chat(id: string) {
    let c = this.chats.get(id)
    if (!c) {
      c = newChat()
      this.chats.set(id, c)
    }
    return c
  }

  private addItem(c: Chat, item: ChatItem) {
    if (c.items.some(i => i.id === item.id)) return
    // pesan pengguna dari siaran langsung punya id lain dengan baris JSONL-nya: cocokkan lewat teks
    if (item.k === 'user' && c.items.slice(-6).some(i => i.k === 'user' && i.text === item.text)) return
    c.items = [...c.items, item]
  }

  private onMessage(m: ServerMessage) {
    switch (m.t) {
      case 'models':
        this.models = m.models
        break
      case 'usage':
        this.usageLoading = false
        this.usage.set(m.sessionId ?? '', { context: m.context, plan: m.plan, at: Date.now() })
        if (m.sessionId && m.context) this.tokens.set(m.sessionId, m.context.total)
        break
      case 'settings':
        this.settings = m.settings
        break
      case 'plan':
        this.plan = m.plan
        break
      case 'tokens':
        this.tokens.set(m.sessionId, m.total)
        break
      case 'status': {
        const prev = this.runs.get(m.sessionId)
        this.runs.set(m.sessionId, { status: m.status, mode: m.mode, pending: m.pending, model: m.model, effort: m.effort })
        // perbarui lingkar konteks setiap kali Claude selesai satu giliran
        if (m.status === 'idle' && prev?.status !== 'idle' && this.open.has(m.sessionId)) this.requestUsage(m.sessionId)
        if (this.sessions.some(x => x.id === m.sessionId)) {
          this.sessions = this.sessions.map(x =>
            x.id === m.sessionId ? { ...x, status: m.status, mode: m.mode, pending: m.pending.length } : x,
          )
        }
        if (m.status === 'idle' || m.status === 'closed') {
          const c = this.chats.get(m.sessionId)
          if (c) c.streaming = ''
        }
        // sesi baru belum tercatat di daftar saat 'started' (berkas JSONL baru ditulis setelahnya): muat ulang begitu giliran selesai
        if (m.status === 'idle' && (!this.sessions.some(x => x.id === m.sessionId) || Date.now() - this.lastRefresh > 15_000)) {
          void this.refreshSessions()
        }
        break
      }
      case 'event': {
        const c = this.chat(m.sessionId)
        if (c.loading) c.queued.push(m.item)
        else this.addItem(c, m.item)
        if (m.item.k === 'assistant' || m.item.k === 'tool') c.streaming = ''
        break
      }
      case 'delta': {
        const c = this.chat(m.sessionId)
        c.streaming += m.text
        break
      }
      case 'resync':
        void this.loadHistory(m.sessionId)
        break
      case 'started': {
        const w = this.waiters.get(m.ref)
        if (w) {
          this.waiters.delete(m.ref)
          w.resolve(m.sessionId)
        }
        void this.refreshSessions()
        break
      }
      case 'error': {
        const w = m.ref ? this.waiters.get(m.ref) : undefined
        if (w && m.ref) {
          this.waiters.delete(m.ref)
          w.reject(new Error(m.message))
        }
        this.showToast(m.message)
        break
      }
      default:
        return
    }
    this.changed()
  }

  // ---------- percakapan ----------

  openChat(id: string) {
    this.open.add(id)
    this.focusId = id
    this.sendFocus()
    this.raw({ t: 'subscribe', sessionId: id, lastSeq: -1 })
    void this.loadHistory(id)
    this.requestUsage(id)
  }

  closeChat(id: string) {
    this.open.delete(id)
    if (this.focusId === id) this.focusId = null
    this.sendFocus()
    this.raw({ t: 'unsubscribe', sessionId: id })
  }

  async loadHistory(id: string, older = false) {
    const c = this.chat(id)
    if (c.loading || (older && c.before === null)) return
    c.loading = true
    this.changed()
    try {
      const q = older && c.before !== null ? `&before=${c.before}` : ''
      const page = await this.api<HistoryPage>(`/api/sessions/${id}/history?limit=120${q}`)
      if (older) {
        const have = new Set(c.items.map(i => i.id))
        c.items = [...page.items.filter(i => !have.has(i.id)), ...c.items]
      } else {
        c.items = page.items
      }
      c.before = page.before
      c.loaded = true
    } catch (e) {
      this.showToast(e instanceof Error ? e.message : String(e))
    } finally {
      c.loading = false
      for (const it of c.queued.splice(0)) this.addItem(c, it)
      this.changed()
    }
  }

  // kirim ke sesi yang ada; tanpa sessionId membuat sesi baru dan mengembalikan id-nya
  send(
    text: string,
    opts: { sessionId?: string; cwd?: string; images?: ImageAttachment[]; model?: string; effort?: EffortLevel } = {},
  ): Promise<string> {
    const { sessionId, cwd, model, effort } = opts
    const ref = Math.random().toString(36).slice(2)
    const images = opts.images?.map(i => ({ mediaType: i.mediaType, data: i.data }))
    if (!this.raw({ t: 'send', ref, sessionId, cwd, text, images: images?.length ? images : undefined, model, effort })) {
      return Promise.reject(new Error('Belum tersambung ke Bima'))
    }
    if (sessionId) {
      this.open.add(sessionId)
      return Promise.resolve(sessionId)
    }
    return new Promise((resolve, reject) => {
      this.waiters.set(ref, { resolve, reject })
      setTimeout(() => {
        if (this.waiters.delete(ref)) reject(new Error('Sesi baru tidak kunjung mulai'))
      }, 90_000)
    })
  }

  answer(a: Answer) {
    if (!this.raw({ t: 'answer', answer: a })) this.showToast('Belum tersambung ke Bima')
  }

  interrupt(id: string) {
    this.raw({ t: 'interrupt', sessionId: id })
  }

  stop(id: string) {
    this.raw({ t: 'stop', sessionId: id })
  }

  setMode(id: string, mode: PermissionMode) {
    if (!this.raw({ t: 'mode', sessionId: id, mode })) this.showToast('Belum tersambung ke Bima')
  }

  setModel(id: string, model: string) {
    if (!this.raw({ t: 'model', sessionId: id, model })) this.showToast('Belum tersambung ke Bima')
  }

  setEffort(id: string, effort: EffortLevel | 'default') {
    if (!this.raw({ t: 'effort', sessionId: id, effort })) this.showToast('Belum tersambung ke Bima')
  }

  setSource(source: SourceId) {
    if (!this.raw({ t: 'setSource', source })) this.showToast('Belum tersambung ke Bima')
  }

  setCompactWindow(tokens: number) {
    if (!this.raw({ t: 'setCompactWindow', tokens })) this.showToast('Belum tersambung ke Bima')
  }

  requestModels() {
    this.raw({ t: 'models' })
  }

  requestUsage(sessionId?: string) {
    if (this.raw({ t: 'usage', sessionId })) {
      this.usageLoading = true
      this.changed()
    }
  }
}

export const client = new Client()

export function useClient() {
  useSyncExternalStore(client.subscribe, client.getVersion)
  return client
}
