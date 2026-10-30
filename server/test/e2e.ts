// Uji ujung ke ujung dengan Claude Code sungguhan (memakai kuota langganan, jadi jalankan seperlunya).
// Pakai: ITSVIBES_URL=http://127.0.0.1:6799 ITSVIBES_TOKEN=... ITSVIBES_WORK=/folder/kerja node test/e2e.ts
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { WebSocket } from 'ws'

// PNG polos satu warna tanpa dependensi, untuk uji kirim foto
function solidPng(w: number, h: number, rgb: [number, number, number]): string {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3).map((_, i) => rgb[i % 3])])
  const raw = Buffer.concat(Array.from({ length: h }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64')
}
import type { ServerMessage } from '../../shared/protocol.ts'

const URL_ = process.env.ITSVIBES_URL!
const TOKEN = process.env.ITSVIBES_TOKEN!
const WORK = process.env.ITSVIBES_WORK!
const headers = { authorization: `Bearer ${TOKEN}` }
let failed = 0
const ok = (name: string, cond: boolean, extra = '') => {
  if (!cond) failed++
  console.log(`  [${cond ? 'LOLOS' : 'GAGAL'}] ${name}${extra ? ' ' + extra : ''}`)
}

function connect(role: 'app' | 'notifier') {
  const ws = new WebSocket(`${URL_.replace('http', 'ws')}/ws?role=${role}`, { headers })
  const inbox: ServerMessage[] = []
  const waiters: { pred: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = []
  ws.on('message', raw => {
    const m = JSON.parse(String(raw)) as ServerMessage
    inbox.push(m)
    for (const w of waiters.splice(0)) {
      if (w.pred(m)) w.resolve(m)
      else waiters.push(w)
    }
  })
  const wait = (pred: (m: ServerMessage) => boolean, ms = 180_000) => {
    const found = inbox.find(pred)
    if (found) return Promise.resolve(found)
    return new Promise<ServerMessage>((resolve, reject) => {
      waiters.push({ pred, resolve })
      setTimeout(() => reject(new Error('timeout menunggu pesan')), ms).unref()
    })
  }
  return { ws, inbox, wait, open: new Promise(r => ws.once('open', r)), send: (m: unknown) => ws.send(JSON.stringify(m)) }
}

const t0 = Date.now()
const list = await (await fetch(`${URL_}/api/sessions`, { headers })).json() as { id: string; title: string; size: number }[]
ok('daftar sesi', Array.isArray(list) && list.length > 0, `(${list.length} sesi, ${Date.now() - t0} ms)`)
const big = [...list].sort((a, b) => b.size - a.size)[0]
const t1 = Date.now()
const hist = await (await fetch(`${URL_}/api/sessions/${big.id}/history?limit=60`, { headers })).json() as { items: { k: string }[]; before: number | null }
ok('riwayat sesi terbesar', hist.items.length > 0, `("${big.title}", ${(big.size / 2 ** 20).toFixed(0)} MB, ${hist.items.length} item, ${Date.now() - t1} ms)`)
ok('tanpa token ditolak', (await fetch(`${URL_}/api/sessions`)).status === 401)

const app = connect('app')
const notifier = connect('notifier')
await Promise.all([app.open, notifier.open])

console.log('== sesi baru')
app.send({ t: 'send', ref: 'r1', cwd: WORK, text: 'Balas hanya dengan satu kata: halo', model: 'haiku' })
const started = await app.wait(m => m.t === 'started' && m.ref === 'r1') as Extract<ServerMessage, { t: 'started' }>
const sid = started.sessionId
app.send({ t: 'subscribe', sessionId: sid, lastSeq: 0 })
const idle1 = await app.wait(m => m.t === 'status' && m.sessionId === sid && m.status === 'idle') as Extract<ServerMessage, { t: 'status' }>
ok('sesi baru memakai model pilihan', idle1.model === 'haiku', String(idle1.model))
const texts = app.inbox.filter(m => m.t === 'event' && m.sessionId === sid && m.item.k === 'assistant')
ok('jawaban diterima', texts.length > 0, JSON.stringify((texts[0] as any)?.item.text))
ok('teks mengalir (delta)', app.inbox.some(m => m.t === 'delta' && m.sessionId === sid))
ok('notifikasi selesai ke notifier', !!(await notifier.wait(m => m.t === 'notify' && m.sessionId === sid && m.kind === 'done', 10_000)))

console.log('== izin tool')
app.send({ t: 'send', ref: 'r2', sessionId: sid, text: 'Pakai tool Write untuk membuat berkas tes.txt di folder kerja ini berisi kata vibes. Jangan pakai Bash.' })
const reqMsg = await app.wait(m => m.t === 'status' && m.sessionId === sid && m.pending.some(p => p.kind === 'permission')) as Extract<ServerMessage, { t: 'status' }>
const req = reqMsg.pending.find(p => p.kind === 'permission')!
ok('permintaan izin muncul', req.toolName === 'Write', req.summary)
ok('notifikasi izin ke notifier', !!(await notifier.wait(m => m.t === 'notify' && m.sessionId === sid && m.kind === 'request', 10_000)))
app.send({ t: 'answer', answer: { requestId: req.id, behavior: 'allow' } })
await app.wait(m => m.t === 'status' && m.sessionId === sid && m.status === 'idle' && app.inbox.indexOf(m) > app.inbox.indexOf(reqMsg))
ok('berkas dibuat setelah diizinkan', fs.existsSync(path.join(WORK, 'tes.txt')) && fs.readFileSync(path.join(WORK, 'tes.txt'), 'utf8').includes('vibes'))

console.log('== pertanyaan pilihan')
const before = app.inbox.length
app.send({ t: 'send', ref: 'r3', sessionId: sid, text: 'Pakai tool AskUserQuestion untuk menanyakan warna favorit saya dengan pilihan Merah dan Biru. Setelah saya jawab, sebutkan jawaban saya dalam satu kalimat.' })
const qMsg = await app.wait(m => app.inbox.indexOf(m) >= before && m.t === 'status' && m.sessionId === sid && m.pending.some(p => p.kind === 'question')) as Extract<ServerMessage, { t: 'status' }>
const q = qMsg.pending.find(p => p.kind === 'question')!
ok('pertanyaan dengan pilihan diterima', !!q.questions?.length && q.questions[0].options.length >= 2, JSON.stringify(q.questions?.[0].options.map(o => o.label)))
app.send({ t: 'answer', answer: { requestId: q.id, behavior: 'allow', answers: { [q.questions![0].question]: 'Biru' } } })
await app.wait(m => app.inbox.indexOf(m) > app.inbox.indexOf(qMsg) && m.t === 'status' && m.sessionId === sid && m.status === 'idle')
const after = app.inbox.slice(app.inbox.indexOf(qMsg)).filter(m => m.t === 'event' && m.item.k === 'assistant').map(m => (m as any).item.text).join(' ')
ok('Claude memakai jawaban dari HP', /biru/i.test(after), JSON.stringify(after.slice(0, 120)))

console.log('== model dan foto')
app.send({ t: 'models' })
const ml = await app.wait(m => m.t === 'models') as Extract<ServerMessage, { t: 'models' }>
ok('daftar model', ml.models.length > 0, JSON.stringify(ml.models.map(x => x.value)))
app.send({ t: 'model', sessionId: sid, model: 'sonnet' })
ok('model diganti di tengah sesi', !!(await app.wait(m => m.t === 'status' && m.sessionId === sid && m.model === 'sonnet', 30_000)))
app.send({ t: 'model', sessionId: sid, model: 'haiku' })
await app.wait(m => m.t === 'status' && m.sessionId === sid && m.model === 'haiku', 30_000)
const markF = app.inbox.length
app.send({
  t: 'send', ref: 'r5', sessionId: sid, text: 'Warna gambar ini apa? Jawab satu kata dalam bahasa Indonesia.',
  images: [{ mediaType: 'image/png', data: solidPng(64, 64, [220, 20, 20]) }],
})
const photoMsg = await app.wait(m => app.inbox.indexOf(m) >= markF && m.t === 'event' && m.sessionId === sid && m.item.k === 'user')
ok('pesan pengguna mencatat 1 foto', photoMsg.t === 'event' && photoMsg.item.k === 'user' && photoMsg.item.images === 1)
await app.wait(m => app.inbox.indexOf(m) > app.inbox.indexOf(photoMsg) && m.t === 'status' && m.sessionId === sid && m.status === 'idle')
const color = app.inbox.slice(markF).filter(m => m.t === 'event' && m.item.k === 'assistant').map(m => (m as any).item.text).join(' ')
ok('Claude melihat foto dari HP', /merah/i.test(color), JSON.stringify(color.slice(0, 60)))
app.send({ t: 'send', ref: 'r6', sessionId: sid, text: '', images: [{ mediaType: 'image/bmp' as any, data: 'x' }] })
ok('foto berformat salah ditolak', !!(await app.wait(m => m.t === 'error' && m.ref === 'r6', 10_000)))

console.log('== upaya dan penggunaan')
app.send({ t: 'effort', sessionId: sid, effort: 'low' })
ok('upaya diganti', !!(await app.wait(m => m.t === 'status' && m.sessionId === sid && m.effort === 'low', 30_000)))
app.send({ t: 'usage', sessionId: sid })
const us = await app.wait(m => m.t === 'usage', 60_000) as Extract<ServerMessage, { t: 'usage' }>
ok('konteks sesi terbaca', !!us.context && us.context.total > 0 && us.context.categories.length > 0,
  us.context ? `${us.context.total}/${us.context.max} (${us.context.percentage}%), ${us.context.categories.map(c => c.id ?? c.name).join(',')}` : 'null')
ok('kuota paket terbaca', !!us.plan?.session, JSON.stringify(us.plan))

console.log('== hentikan lalu lanjutkan')
app.send({ t: 'stop', sessionId: sid })
await app.wait(m => m.t === 'status' && m.sessionId === sid && m.status === 'closed', 30_000)
const mark = app.inbox.length
app.send({ t: 'send', ref: 'r4', sessionId: sid, text: 'Apa isi berkas yang tadi kamu buat? Jawab satu kata.' })
const idle4 = await app.wait(m => app.inbox.indexOf(m) >= mark && m.t === 'status' && m.sessionId === sid && m.status === 'idle') as Extract<ServerMessage, { t: 'status' }>
ok('model pilihan tetap dipakai setelah dilanjutkan', idle4.model === 'haiku', String(idle4.model))
const resumed = app.inbox.slice(mark).filter(m => m.t === 'event' && m.item.k === 'assistant').map(m => (m as any).item.text).join(' ')
ok('konteks tetap ada setelah dilanjutkan', /vibes/i.test(resumed), JSON.stringify(resumed.slice(0, 80)))

const h2 = await (await fetch(`${URL_}/api/sessions/${sid}/history?limit=200`, { headers })).json() as { items: { k: string; text?: string }[] }
ok('riwayat sesi baru terbaca dari JSONL', h2.items.filter(i => i.k === 'user').length >= 4, `(${h2.items.length} item)`)
const listed = (await (await fetch(`${URL_}/api/sessions`, { headers })).json() as { id: string; automated: boolean }[]).find(s => s.id === sid)
ok('sesi baru tampil di daftar (bukan disembunyikan sebagai otomatis)', !!listed && !listed.automated)
console.log(`SESI_UJI=${sid}`)
app.ws.close()
notifier.ws.close()
console.log(failed ? `${failed} GAGAL` : 'SEMUA LOLOS')
process.exit(failed ? 1 : 0)
