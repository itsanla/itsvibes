import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import zlib from 'node:zlib'
import { WebSocket, WebSocketServer } from 'ws'
import { bearer, checkToken, createPairCode, redeemPairCode } from './auth.ts'
import { APK_DIR, DEFAULT_CWD, HOST, PORT, VERSION, WEB_DIR } from './config.ts'
import { Hub } from './runner.ts'
import { findFile, history, isAutomated, listFiles, liveElsewhere, meta } from './sessions.ts'
import { PROTOCOL_VERSION } from '../../shared/protocol.ts'
import type { ClientMessage, ServerMessage, SessionSummary } from '../../shared/protocol.ts'

if (process.argv[2] === 'pair') {
  console.log(`Kode pairing itsvibes: ${createPairCode()} (berlaku 10 menit, maksimal 5 kali salah)`)
  process.exit(0)
}

interface Conn { ws: WebSocket; role: 'app' | 'notifier'; subs: Set<string>; focus: string | null; visible: boolean; alive: boolean }
const conns = new Set<Conn>()

function sendTo(c: Conn, msg: ServerMessage) {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg))
}

const hub = new Hub({
  toSubscribers(sessionId, msg) {
    for (const c of conns) if (c.role === 'app' && c.subs.has(sessionId)) sendTo(c, msg)
  },
  toAll(msg) {
    for (const c of conns) if (c.role === 'app') sendTo(c, msg)
  },
  notify(sessionId, kind, title, body) {
    // tidak perlu notifikasi kalau sesi itu sedang terbuka di layar HP
    const watching = [...conns].some(c => c.role === 'app' && c.visible && c.focus === sessionId)
    if (watching) return
    const msg: ServerMessage = { t: 'notify', id: crypto.randomUUID(), sessionId, title, body, kind }
    for (const c of conns) if (c.role === 'notifier') sendTo(c, msg)
  },
  appCount() {
    return [...conns].filter(c => c.role === 'app').length
  },
  started(ref, sessionId) {
    for (const c of conns) if (c.role === 'app') sendTo(c, { t: 'started', ref, sessionId })
  },
})

function summaries(showAutomated: boolean): SessionSummary[] {
  const live = liveElsewhere()
  const out: SessionSummary[] = []
  for (const f of listFiles().sort((a, b) => b.mtime - a.mtime)) {
    const m = meta(f)
    const automated = isAutomated(f.id, m)
    if (automated && !showAutomated) continue
    const run = hub.runs.get(f.id)
    out.push({
      id: f.id, title: m.title || '(tanpa judul)', cwd: m.cwd, project: f.project, mtime: f.mtime, size: f.size,
      status: run ? run.status : live.has(f.id) ? 'terminal' : 'closed', mode: run?.mode, automated,
      pending: run?.pending.size ?? 0,
    })
    if (out.length >= 400) break
  }
  return out
}

function cwds(): string[] {
  const seen = new Set<string>([DEFAULT_CWD])
  for (const f of listFiles().sort((a, b) => b.mtime - a.mtime).slice(0, 80)) {
    const c = meta(f).cwd
    if (c && fs.existsSync(c)) seen.add(fs.realpathSync(c))
  }
  for (const top of ['/Data_A/project']) {
    try {
      for (const a of fs.readdirSync(top, { withFileTypes: true })) {
        if (!a.isDirectory() || a.name.startsWith('.')) continue
        for (const b of fs.readdirSync(path.join(top, a.name), { withFileTypes: true })) {
          if (b.isDirectory() && !b.name.startsWith('.')) seen.add(path.join(top, a.name, b.name))
        }
      }
    } catch {
      // folder proyek tidak ada di mesin ini
    }
  }
  return [...seen]
}

function json(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(data))
}

async function body(req: http.IncomingMessage): Promise<any> {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
    if (raw.length > 16_384) throw new Error('terlalu besar')
  }
  return raw ? JSON.parse(raw) : {}
}

const authed = (req: http.IncomingMessage, url: URL) => checkToken(bearer(req.headers.authorization) ?? url.searchParams.get('token'))

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  try {
    if (url.pathname === '/health') return json(res, 200, { ok: true, version: VERSION, protocol: PROTOCOL_VERSION })
    if (url.pathname === '/api/pair' && req.method === 'POST') {
      const b = await body(req)
      const token = redeemPairCode(String(b.code ?? ''), String(b.name ?? ''))
      if (!token) {
        await new Promise(r => setTimeout(r, 800))
        return json(res, 401, { error: 'Kode salah atau kedaluwarsa. Buat kode baru di Bima: itsvibes-pair' })
      }
      return json(res, 200, { token, version: VERSION })
    }
    if (url.pathname === '/download' || url.pathname.startsWith('/download/')) return download(url, res)
    if (url.pathname.startsWith('/api/')) {
      if (!authed(req, url)) {
        await new Promise(r => setTimeout(r, 500))
        return json(res, 401, { error: 'Token tidak berlaku, pasangkan ulang perangkat' })
      }
      if (url.pathname === '/api/sessions') return json(res, 200, summaries(url.searchParams.get('automated') === '1'))
      if (url.pathname === '/api/cwds') return json(res, 200, cwds())
      // perangkat yang sudah terpasang boleh membuat kode untuk perangkat lain (browser baru), tanpa SSH ke Bima
      if (url.pathname === '/api/pair-code' && req.method === 'POST') return json(res, 200, { code: createPairCode() })
      const m = /^\/api\/sessions\/([0-9a-f-]{36})\/history$/.exec(url.pathname)
      if (m) {
        const f = findFile(m[1])
        if (!f) return json(res, 404, { error: 'Sesi tidak ditemukan' })
        const before = url.searchParams.get('before')
        const limit = Math.min(Number(url.searchParams.get('limit') ?? 120) || 120, 400)
        return json(res, 200, history(f, before ? Number(before) : undefined, limit))
      }
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (url.pathname.startsWith('/api/') || url.pathname === '/ws') return json(res, 404, { error: 'Tidak ada' })
      if (serveWeb(req, url, res)) return
    }
    json(res, 404, { error: 'Tidak ada' })
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : String(e) })
  }
})

// ---------- versi web: berkas statis hasil `expo export -p web`, dengan fallback SPA ke index.html ----------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.map', '.svg', '.webmanifest', '.txt', '.ttf', '.otf'])
const gzipCache = new Map<string, { mtime: number; data: Buffer }>()

function serveWeb(req: http.IncomingMessage, url: URL, res: http.ServerResponse): boolean {
  if (!fs.existsSync(path.join(WEB_DIR, 'index.html'))) return false
  let rel: string
  try {
    rel = decodeURIComponent(url.pathname)
  } catch {
    return false
  }
  let file = path.join(WEB_DIR, path.normalize(rel))
  if (file !== WEB_DIR && !file.startsWith(WEB_DIR + path.sep)) return false // cegah ../
  let st = fs.statSync(file, { throwIfNoEntry: false })
  if (st?.isDirectory()) {
    file = path.join(file, 'index.html')
    st = fs.statSync(file, { throwIfNoEntry: false })
  }
  if (!st?.isFile()) {
    // jalur aplikasi (/session/<id>, /settings, ...) dibuka langsung atau di-refresh: kembalikan index.html
    if (path.extname(rel)) return false
    file = path.join(WEB_DIR, 'index.html')
    st = fs.statSync(file)
  }
  const ext = path.extname(file)
  const hashed = file.includes(`${path.sep}_expo${path.sep}`) || file.includes(`${path.sep}assets${path.sep}`)
  const headers: Record<string, string | number> = {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'last-modified': st.mtime.toUTCString(),
  }
  const gz = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
  if (gz) {
    let c = gzipCache.get(file)
    if (!c || c.mtime !== st.mtimeMs) {
      c = { mtime: st.mtimeMs, data: zlib.gzipSync(fs.readFileSync(file), { level: 9 }) }
      gzipCache.set(file, c)
    }
    headers['content-encoding'] = 'gzip'
    headers['content-length'] = c.data.length
    headers.vary = 'Accept-Encoding'
    res.writeHead(200, headers)
    res.end(req.method === 'HEAD' ? undefined : c.data)
    return true
  }
  headers['content-length'] = st.size
  res.writeHead(200, headers)
  if (req.method === 'HEAD') res.end()
  else fs.createReadStream(file).pipe(res)
  return true
}

// APK tidak berisi rahasia (token didapat saat pairing), jadi boleh diunduh tanpa login
function download(url: URL, res: http.ServerResponse) {
  const files = fs.existsSync(APK_DIR) ? fs.readdirSync(APK_DIR).filter(f => f.endsWith('.apk')).sort().reverse() : []
  const name = decodeURIComponent(url.pathname.slice('/download/'.length))
  if (name) {
    if (!files.includes(name)) return json(res, 404, { error: 'Tidak ada' })
    const file = path.join(APK_DIR, name)
    res.writeHead(200, {
      'content-type': 'application/vnd.android.package-archive',
      'content-length': fs.statSync(file).size,
      'content-disposition': `attachment; filename="${name}"`,
    })
    return fs.createReadStream(file).pipe(res)
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>itsvibes</title>
<body style="font-family:system-ui;margin:24px;background:#0f1115;color:#e8e8e8"><h2>itsvibes</h2>
${files.map(f => `<p><a style="color:#8ab4ff;font-size:18px" href="/download/${encodeURIComponent(f)}">${f}</a></p>`).join('') || '<p>Belum ada APK.</p>'}`)
}

// pesan berisi foto dari HP bisa beberapa MB
const wss = new WebSocketServer({ noServer: true, maxPayload: 40 << 20 })

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
function badImages(images: unknown): string | null {
  if (images === undefined) return null
  if (!Array.isArray(images) || images.length > 6) return 'Maksimal 6 foto per pesan'
  for (const i of images) {
    if (!i || !IMAGE_TYPES.has(i.mediaType) || typeof i.data !== 'string') return 'Format foto tidak didukung'
    if (i.data.length > 7_000_000) return 'Foto terlalu besar (maksimal sekitar 5 MB)'
  }
  return null
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x')
  if (url.pathname !== '/ws' || !authed(req, url)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, ws => {
    const c: Conn = { ws, role: url.searchParams.get('role') === 'notifier' ? 'notifier' : 'app', subs: new Set(), focus: null, visible: false, alive: true }
    conns.add(c)
    sendTo(c, { t: 'hello', version: VERSION, protocol: PROTOCOL_VERSION })
    if (c.role === 'app') {
      for (const r of hub.runs.values()) sendTo(c, r.statusMessage())
      sendTo(c, { t: 'settings', settings: hub.settings() })
      sendTo(c, { t: 'plan', plan: hub.plan })
      void hub.refreshPlan()
    }
    ws.on('pong', () => (c.alive = true))
    ws.on('close', () => conns.delete(c))
    ws.on('message', raw => {
      let m: ClientMessage
      try {
        m = JSON.parse(String(raw))
      } catch {
        return
      }
      void onMessage(c, m).catch(e => sendTo(c, { t: 'error', message: e instanceof Error ? e.message : String(e) }))
    })
  })
})

async function onMessage(c: Conn, m: ClientMessage) {
  switch (m.t) {
    case 'ping':
      return sendTo(c, { t: 'pong' })
    case 'focus':
      c.focus = m.sessionId
      c.visible = m.visible
      return
    case 'subscribe': {
      c.subs.add(m.sessionId)
      sendTo(c, { t: 'tokens', sessionId: m.sessionId, total: hub.tokens(m.sessionId) })
      const r = hub.runs.get(m.sessionId)
      if (!r) {
        const pid = liveElsewhere().get(m.sessionId)
        const p = hub.pref(m.sessionId)
        return sendTo(c, { t: 'status', sessionId: m.sessionId, status: pid ? 'terminal' : 'closed', pending: [], model: p.model, effort: p.effort })
      }
      const last = m.lastSeq ?? 0
      const first = r.buffer.length ? (r.buffer[0] as { seq?: number }).seq ?? 1 : r.seq + 1
      if (last === -1) {
        // aplikasi mengambil riwayat dari JSONL sendiri; cukup kirim status (dengan seq terakhir)
      } else if (last > 0 && last < first - 1) sendTo(c, { t: 'resync', sessionId: m.sessionId })
      else for (const b of r.buffer) if (((b as { seq?: number }).seq ?? 0) > last) sendTo(c, b)
      return sendTo(c, r.statusMessage())
    }
    case 'unsubscribe':
      c.subs.delete(m.sessionId)
      return
    case 'send': {
      const text = (m.text ?? '').trim()
      const bad = badImages(m.images)
      if (bad) return sendTo(c, { t: 'error', ref: m.ref, sessionId: m.sessionId, message: bad })
      if (!text && !m.images?.length) return
      if (m.sessionId) c.subs.add(m.sessionId)
      const err = hub.send({ ref: m.ref, sessionId: m.sessionId, cwd: m.cwd, text, images: m.images, model: m.model, effort: m.effort })
      if (err) sendTo(c, { t: 'error', ref: m.ref, sessionId: m.sessionId, message: err })
      return
    }
    case 'models':
      return sendTo(c, { t: 'models', models: hub.models() })
    case 'model': {
      const running = hub.runs.has(m.sessionId)
      const st = await hub.setModel(m.sessionId, m.model)
      // sesi yang berjalan sudah menyiarkan statusnya sendiri; sesi yang tutup belum punya siaran
      if (!running) for (const x of conns) if (x.role === 'app') sendTo(x, st)
      return
    }
    case 'effort': {
      const running = hub.runs.has(m.sessionId)
      const st = await hub.setEffort(m.sessionId, m.effort)
      if (!running) for (const x of conns) if (x.role === 'app') sendTo(x, st)
      return
    }
    case 'usage': {
      const u = await hub.usage(m.sessionId)
      return sendTo(c, { t: 'usage', sessionId: m.sessionId, context: u.context, plan: u.plan })
    }
    case 'setSource':
      return hub.setSource(m.source)
    case 'setCompactWindow':
      return hub.setCompactWindow(m.tokens)
    case 'answer':
      if (!hub.answer(m.answer)) sendTo(c, { t: 'error', message: 'Permintaan itu sudah tidak menunggu jawaban' })
      return
    case 'interrupt':
      return hub.runs.get(m.sessionId)?.interrupt()
    case 'mode':
      return hub.runs.get(m.sessionId)?.setMode(m.mode)
    case 'stop':
      return hub.end(m.sessionId)
  }
}

// ping berkala: menjaga koneksi lewat proxy tetap hidup dan membuang koneksi HP yang sudah mati
setInterval(() => {
  for (const c of conns) {
    if (!c.alive) {
      c.ws.terminate()
      conns.delete(c)
      continue
    }
    c.alive = false
    c.ws.ping()
  }
}, 25_000).unref()

server.listen(PORT, HOST, () => {
  console.log(`itsvibes-server ${VERSION} di http://${HOST}:${PORT}`)
  // hangatkan cache judul supaya daftar sesi pertama tidak lambat
  setTimeout(() => {
    const t = Date.now()
    for (const f of listFiles()) meta(f)
    console.log(`cache judul siap (${Date.now() - t} ms)`)
  }, 100)
})

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    for (const r of hub.runs.values()) r.stop()
    server.close()
    setTimeout(() => process.exit(0), 1500).unref()
  })
}
