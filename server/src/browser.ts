import { type ChildProcess, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WebSocket } from 'ws'
import { BROWSER_DISPLAY, BROWSER_PORT, BROWSER_PROFILE, BROWSER_SIZE } from './config.ts'
import type { BrowserClientMsg, BrowserServerMsg, BrowserTab } from '../../shared/protocol.ts'

// Satu Chromium bersama untuk Claude dan untuk Aan. Claude memakainya lewat Playwright MCP (--cdp-endpoint),
// Aan menontonnya lewat screencast CDP yang diteruskan ke halaman /browser. Profilnya tetap, jadi login bertahan.

const CDP = `http://127.0.0.1:${BROWSER_PORT}`

function findChromium(): string | null {
  if (process.env.ITSVIBES_CHROMIUM) return process.env.ITSVIBES_CHROMIUM
  const root = path.join(os.homedir(), '.cache/ms-playwright')
  try {
    const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)))
    for (const d of dirs) {
      const bin = path.join(root, d, 'chrome-linux64/chrome')
      if (fs.existsSync(bin)) return bin
    }
  } catch {
    // Playwright belum memasang Chromium
  }
  return null
}

// ---------- klien CDP minimal ----------

type Params = Record<string, unknown>
class Cdp {
  private ws: WebSocket
  private id = 0
  private calls = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private onEvent: (method: string, params: any, sessionId?: string) => void
  closed = false

  private constructor(ws: WebSocket, onEvent: Cdp['onEvent'], onClose: () => void) {
    this.ws = ws
    this.onEvent = onEvent
    ws.on('message', raw => {
      let m: { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: unknown; sessionId?: string }
      try {
        m = JSON.parse(String(raw))
      } catch {
        return
      }
      if (m.id !== undefined) {
        const c = this.calls.get(m.id)
        if (!c) return
        this.calls.delete(m.id)
        if (m.error) c.reject(new Error(m.error.message))
        else c.resolve(m.result)
      } else if (m.method) this.onEvent(m.method, m.params, m.sessionId)
    })
    ws.on('close', () => {
      this.closed = true
      for (const c of this.calls.values()) c.reject(new Error('CDP terputus'))
      this.calls.clear()
      onClose()
    })
    ws.on('error', () => {})
  }

  static connect(url: string, onEvent: Cdp['onEvent'], onClose: () => void): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 << 20 })
      ws.once('open', () => resolve(new Cdp(ws, onEvent, onClose)))
      ws.once('error', reject)
    })
  }

  send<T = any>(method: string, params: Params = {}, sessionId?: string): Promise<T> {
    if (this.closed) return Promise.reject(new Error('CDP terputus'))
    const id = ++this.id
    return new Promise<T>((resolve, reject) => {
      this.calls.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
  }

  close() {
    this.ws.close()
  }
}

// ---------- penonton ----------

export interface Viewer {
  json(msg: BrowserServerMsg): void
  frame(jpeg: Buffer): void
}

interface Attached {
  targetId: string
  cdpSession: string
  viewers: Set<Viewer>
  w: number
  h: number
}

export class BrowserHost {
  private xvfb: ChildProcess | null = null
  private chrome: ChildProcess | null = null
  private cdp: Cdp | null = null
  private stopping = false
  private starting: Promise<void> | null = null
  state: 'off' | 'starting' | 'ready' | 'error' = 'off'
  message = ''
  private tabs = new Map<string, BrowserTab>()
  private visible = new Map<string, boolean>() // tab yang sedang di depan (document.visibilityState)
  private attached = new Map<string, Attached>() // per targetId
  private viewers = new Map<Viewer, { pinned: string | null; target: string | null; sent: string }>()
  private poll: ReturnType<typeof setInterval> | null = null
  private snap: { at: number; jpeg: Buffer } | null = null

  get available(): boolean {
    return !!findChromium() && fs.existsSync('/usr/bin/Xvfb')
  }

  // ---------- proses ----------

  start(): Promise<void> {
    if (this.stopping) return Promise.resolve()
    if (this.state === 'ready') return Promise.resolve()
    return (this.starting ??= this.boot().finally(() => (this.starting = null)))
  }

  private async boot() {
    const bin = findChromium()
    if (!bin) return this.fail('Chromium belum terpasang (npx playwright install chromium)')
    this.state = 'starting'
    this.broadcastStatus()
    try {
      fs.mkdirSync(BROWSER_PROFILE, { recursive: true, mode: 0o700 })
      this.prepareProfile()
      await this.startXvfb()
      await this.startChrome(bin)
      await this.connectCdp()
      this.state = 'ready'
      this.message = ''
      this.broadcastStatus()
      await this.refreshTabs()
      if (!this.poll) this.poll = setInterval(() => void this.tick(), 1000)
    } catch (e) {
      this.fail((e as Error).message)
      setTimeout(() => void this.start(), 5000).unref()
    }
  }

  private fail(message: string) {
    this.state = 'error'
    this.message = message
    console.error(`[browser] ${message}`)
    this.broadcastStatus()
  }

  // sesi tab terakhir dipulihkan saat Chromium dibuka lagi, supaya cookie tanpa masa berlaku (login sesi) ikut bertahan
  private prepareProfile() {
    const dir = path.join(BROWSER_PROFILE, 'Default')
    const file = path.join(dir, 'Preferences')
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    let prefs: any = {}
    try {
      prefs = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      // profil baru
    }
    prefs.session = { ...(prefs.session ?? {}), restore_on_startup: 1 }
    prefs.profile = { ...(prefs.profile ?? {}), exit_type: 'Normal', exited_cleanly: true }
    fs.writeFileSync(file, JSON.stringify(prefs), { mode: 0o600 })
  }

  private startXvfb(): Promise<void> {
    const sock = `/tmp/.X11-unix/X${BROWSER_DISPLAY}`
    if (fs.existsSync(sock) && this.xvfb) return Promise.resolve()
    try {
      fs.rmSync(`/tmp/.X${BROWSER_DISPLAY}-lock`, { force: true })
      fs.rmSync(sock, { force: true })
    } catch {
      // sisa display lama
    }
    const x = spawn('Xvfb', [`:${BROWSER_DISPLAY}`, '-screen', '0', `${BROWSER_SIZE.w}x${BROWSER_SIZE.h}x24`, '-nolisten', 'tcp', '-dpi', '96'], { stdio: 'ignore' })
    this.xvfb = x
    x.on('exit', () => {
      if (this.xvfb === x) this.xvfb = null
    })
    return new Promise((resolve, reject) => {
      const t0 = Date.now()
      const iv = setInterval(() => {
        if (fs.existsSync(sock)) {
          clearInterval(iv)
          resolve()
        } else if (Date.now() - t0 > 8000) {
          clearInterval(iv)
          reject(new Error('Xvfb tidak mau menyala'))
        }
      }, 50)
    })
  }

  private async startChrome(bin: string) {
    if (this.chrome && this.chrome.exitCode === null) return
    const args = [
      `--user-data-dir=${BROWSER_PROFILE}`,
      `--remote-debugging-port=${BROWSER_PORT}`,
      '--remote-debugging-address=127.0.0.1',
      `--window-size=${BROWSER_SIZE.w},${BROWSER_SIZE.h}`,
      '--window-position=0,0',
      '--start-maximized',
      '--no-first-run',
      '--no-default-browser-check',
      '--password-store=basic',
      '--disable-blink-features=AutomationControlled',
      '--lang=id-ID',
      '--disable-features=Translate,MediaRouter',
      '--force-device-scale-factor=1',
      '--enable-gpu-rasterization',
      '--ignore-gpu-blocklist',
    ]
    if (process.env.ITSVIBES_BROWSER_NOSANDBOX !== '0') args.push('--no-sandbox')
    args.push('about:blank')
    const c = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, DISPLAY: `:${BROWSER_DISPLAY}` } })
    this.chrome = c
    c.stderr?.on('data', () => {}) // buang keluaran noise Chromium
    c.on('exit', code => {
      if (this.chrome === c) this.chrome = null
      this.cdp = null
      this.attached.clear()
      this.tabs.clear()
      if (this.stopping) return
      console.error(`[browser] Chromium berhenti (kode ${code}), dinyalakan lagi`)
      this.state = 'off'
      this.broadcastStatus()
      setTimeout(() => void this.start(), 2000).unref()
    })
  }

  private async connectCdp() {
    let ws = ''
    const t0 = Date.now()
    while (!ws) {
      try {
        const r = await fetch(`${CDP}/json/version`, { signal: AbortSignal.timeout(1500) })
        ws = ((await r.json()) as { webSocketDebuggerUrl?: string }).webSocketDebuggerUrl ?? ''
      } catch {
        if (Date.now() - t0 > 15000) throw new Error('Chromium tidak membuka port CDP')
        await new Promise(r => setTimeout(r, 200))
      }
    }
    this.cdp = await Cdp.connect(ws, (m, p, s) => this.onEvent(m, p, s), () => {
      this.cdp = null
    })
    await this.cdp.send('Target.setDiscoverTargets', { discover: true })
  }

  async stop() {
    this.stopping = true
    if (this.poll) clearInterval(this.poll)
    this.cdp?.close()
    // SIGTERM supaya Chromium sempat menulis cookie dan sesi ke profil
    this.chrome?.kill('SIGTERM')
    await new Promise<void>(r => {
      if (!this.chrome) return r()
      this.chrome.once('exit', () => r())
      setTimeout(r, 4000).unref()
    })
    this.xvfb?.kill('SIGTERM')
  }

  // ---------- target dan tab ----------

  private onEvent(method: string, p: any, cdpSession?: string) {
    if (method === 'Target.targetCreated' || method === 'Target.targetInfoChanged') {
      const t = p.targetInfo
      if (t.type !== 'page' || t.url?.startsWith('devtools://')) return
      this.tabs.set(t.targetId, { id: t.targetId, title: t.title || t.url, url: t.url, active: false })
      this.pushTabs()
    } else if (method === 'Target.targetDestroyed') {
      this.tabs.delete(p.targetId)
      this.visible.delete(p.targetId)
      const a = this.attached.get(p.targetId)
      if (a) this.attached.delete(p.targetId)
      this.pushTabs()
    } else if (method === 'Page.screencastFrame' && cdpSession) {
      const a = [...this.attached.values()].find(x => x.cdpSession === cdpSession)
      void this.cdp?.send('Page.screencastFrameAck', { sessionId: p.sessionId }, cdpSession).catch(() => {})
      if (!a) return
      const md = p.metadata ?? {}
      if (md.deviceWidth && (md.deviceWidth !== a.w || md.deviceHeight !== a.h)) {
        a.w = md.deviceWidth
        a.h = md.deviceHeight
        for (const v of a.viewers) v.json({ t: 'meta', w: a.w, h: a.h })
      }
      const jpeg = Buffer.from(p.data, 'base64')
      for (const v of a.viewers) v.frame(jpeg)
    } else if (method === 'Target.detachedFromTarget') {
      for (const [id, a] of this.attached) if (a.cdpSession === p.sessionId) this.attached.delete(id)
    }
  }

  private async refreshTabs() {
    if (!this.cdp) return
    const { targetInfos } = await this.cdp.send<{ targetInfos: any[] }>('Target.getTargets')
    this.tabs.clear()
    for (const t of targetInfos) {
      if (t.type === 'page' && !t.url?.startsWith('devtools://')) this.tabs.set(t.targetId, { id: t.targetId, title: t.title || t.url, url: t.url, active: false })
    }
    this.pushTabs()
  }

  // tab di depan = yang document.visibilityState-nya 'visible'; dipantau selama ada penonton atau pratinjau
  private async tick() {
    if (!this.cdp || this.state !== 'ready') return
    if (!this.viewers.size && Date.now() - this.lastSnapReq > 10_000) return
    await Promise.all([...this.tabs.keys()].map(async id => {
      try {
        const s = await this.session(id)
        const r = await this.cdp!.send<{ result: { value: boolean } }>('Runtime.evaluate', { expression: "document.visibilityState === 'visible'", returnByValue: true }, s)
        this.visible.set(id, !!r.result.value)
      } catch {
        // tab sedang ditutup
      }
    }))
    this.pushTabs()
  }

  private front(): string | null {
    const ids = [...this.tabs.keys()]
    return ids.find(id => this.visible.get(id)) ?? ids[ids.length - 1] ?? null
  }

  private pushTabs() {
    const front = this.front()
    for (const t of this.tabs.values()) t.active = t.id === front
    const list = [...this.tabs.values()]
    for (const [v, st] of this.viewers) {
      const want = st.pinned && this.tabs.has(st.pinned) ? st.pinned : front
      if (want !== st.target) void this.follow(v, want)
      const msg = { t: 'tabs' as const, tabs: list, current: st.target, pinned: !!st.pinned }
      const key = JSON.stringify(msg)
      if (key !== st.sent) {
        st.sent = key
        v.json(msg)
      }
    }
  }

  private async session(targetId: string): Promise<string> {
    const a = this.attached.get(targetId)
    if (a) return a.cdpSession
    const { sessionId } = await this.cdp!.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true })
    this.attached.set(targetId, { targetId, cdpSession: sessionId, viewers: new Set(), w: 0, h: 0 })
    await this.cdp!.send('Runtime.enable', {}, sessionId).catch(() => {})
    return sessionId
  }

  // ---------- penonton ----------

  async addViewer(v: Viewer) {
    this.viewers.set(v, { pinned: null, target: null, sent: '' })
    v.json({ t: 'status', state: this.state, message: this.message })
    await this.start()
    if (this.state !== 'ready') return
    await this.refreshTabs()
    for (const id of this.tabs.keys()) await this.session(id).catch(() => {})
    await this.tick()
    this.pushTabs()
  }

  removeViewer(v: Viewer) {
    const st = this.viewers.get(v)
    this.viewers.delete(v)
    if (st?.target) void this.unfollow(v, st.target)
  }

  private async follow(v: Viewer, targetId: string | null) {
    const st = this.viewers.get(v)
    if (!st || st.target === targetId) return
    const prev = st.target
    st.target = targetId
    if (prev) await this.unfollow(v, prev)
    if (!targetId || !this.cdp) return
    try {
      const s = await this.session(targetId)
      const a = this.attached.get(targetId)!
      const first = a.viewers.size === 0
      a.viewers.add(v)
      if (a.w) v.json({ t: 'meta', w: a.w, h: a.h })
      if (first) {
        await this.cdp.send('Page.enable', {}, s).catch(() => {})
        await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: BROWSER_SIZE.w, maxHeight: BROWSER_SIZE.h, everyNthFrame: 1 }, s)
      }
      // screencast baru mengirim frame saat ada perubahan; satu jepretan awal supaya layar tidak kosong
      const shot = await this.cdp.send<{ data: string }>('Page.captureScreenshot', { format: 'jpeg', quality: 85 }, s).catch(() => null)
      if (shot) v.frame(Buffer.from(shot.data, 'base64'))
    } catch {
      // tab hilang saat dipilih
    }
  }

  private async unfollow(v: Viewer, targetId: string) {
    const a = this.attached.get(targetId)
    if (!a) return
    a.viewers.delete(v)
    if (!a.viewers.size && this.cdp && !this.cdp.closed) {
      await this.cdp.send('Page.stopScreencast', {}, a.cdpSession).catch(() => {})
    }
  }

  // ---------- masukan dari penonton ----------

  async input(v: Viewer, m: BrowserClientMsg) {
    const st = this.viewers.get(v)
    if (!st || !this.cdp || this.state !== 'ready') return
    if (m.t === 'select') {
      st.pinned = m.id
      return this.pushTabs()
    }
    if (m.t === 'newtab') {
      const { targetId } = await this.cdp.send<{ targetId: string }>('Target.createTarget', { url: m.url || 'about:blank' })
      st.pinned = targetId
      await this.cdp.send('Target.activateTarget', { targetId }).catch(() => {})
      return this.pushTabs()
    }
    if (m.t === 'closetab') return void (await this.cdp.send('Target.closeTarget', { targetId: m.id }).catch(() => {}))
    if (!st.target) return
    const s = await this.session(st.target)
    const send = (method: string, p: Params = {}) => this.cdp!.send(method, p, s).catch(() => {})
    switch (m.t) {
      case 'mouse':
        if (m.type === 'wheel') await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: m.x, y: m.y, deltaX: m.dx ?? 0, deltaY: m.dy ?? 0, modifiers: m.mod ?? 0 })
        else await send('Input.dispatchMouseEvent', { type: m.type, x: m.x, y: m.y, button: m.button ?? 'none', buttons: m.buttons ?? 0, clickCount: m.clicks ?? 0, modifiers: m.mod ?? 0 })
        // tab yang diklik Aan jadi tab depan
        if (m.type === 'mousePressed') await this.cdp.send('Target.activateTarget', { targetId: st.target }).catch(() => {})
        return
      case 'key':
        return void (await send('Input.dispatchKeyEvent', {
          type: m.type, key: m.key, code: m.code, text: m.text, unmodifiedText: m.text, modifiers: m.mod ?? 0,
          windowsVirtualKeyCode: m.vk, nativeVirtualKeyCode: m.vk, autoRepeat: m.repeat ?? false,
          commands: m.commands,
        }))
      case 'text':
        return void (await send('Input.insertText', { text: m.text }))
      case 'nav': {
        const url = /^[a-z][a-z0-9+.-]*:/i.test(m.url) ? m.url : /^[\w.-]+\.[a-z]{2,}(\/|$|:)/i.test(m.url) || m.url.startsWith('localhost') ? `https://${m.url}` : `https://www.google.com/search?q=${encodeURIComponent(m.url)}`
        return void (await send('Page.navigate', { url }))
      }
      case 'history': {
        const h = await this.cdp.send<{ currentIndex: number; entries: { id: number }[] }>('Page.getNavigationHistory', {}, s).catch(() => null)
        const e = h?.entries[h.currentIndex + (m.dir === 'back' ? -1 : 1)]
        if (e) await send('Page.navigateToHistoryEntry', { entryId: e.id })
        return
      }
      case 'reload':
        return void (await send('Page.reload'))
    }
  }

  private broadcastStatus() {
    for (const v of this.viewers.keys()) v.json({ t: 'status', state: this.state, message: this.message })
  }

  // ---------- pratinjau kecil di kartu sesi ----------

  private lastSnapReq = 0
  async snapshot(): Promise<Buffer | null> {
    this.lastSnapReq = Date.now()
    if (this.state !== 'ready') {
      void this.start()
      return null
    }
    if (this.snap && Date.now() - this.snap.at < 700) return this.snap.jpeg
    const id = this.front()
    if (!id || !this.cdp) return null
    try {
      const s = await this.session(id)
      const shot = await this.cdp.send<{ data: string }>('Page.captureScreenshot', { format: 'jpeg', quality: 60 }, s)
      this.snap = { at: Date.now(), jpeg: Buffer.from(shot.data, 'base64') }
      return this.snap.jpeg
    } catch {
      return null
    }
  }
}
