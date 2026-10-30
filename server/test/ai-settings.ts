// Uji sumber AI, angka langsung, dan compact saat sesi berakhir (memakai kuota sungguhan, jadi jalankan seperlunya).
// Pakai: ITSVIBES_URL=ws://127.0.0.1:6799 ITSVIBES_TOKEN=... ITSVIBES_WORK=/folder/kerja node test/ai-settings.ts
import { WebSocket } from 'ws'

const url = process.env.ITSVIBES_URL!
const work = process.env.ITSVIBES_WORK!
const ws = new WebSocket(`${url}/ws?role=app&token=${encodeURIComponent(process.env.ITSVIBES_TOKEN!)}`)
const seen: any[] = []
const wait = (pred: (m: any) => boolean, ms: number, from = 0) => new Promise<any>((resolve, reject) => {
  const t0 = Date.now()
  const i = setInterval(() => {
    const hit = seen.slice(from).find(pred)
    if (hit) { clearInterval(i); resolve(hit) }
    else if (Date.now() - t0 > ms) { clearInterval(i); reject(new Error('timeout menunggu pesan')) }
  }, 100)
})
const out = (m: object) => ws.send(JSON.stringify(m))
const ok = (name: string, cond: boolean, info: unknown = '') => { console.log(`${cond ? 'OK  ' : 'GAGAL'} ${name}`, info); if (!cond) process.exitCode = 1 }
ws.on('message', d => seen.push(JSON.parse(String(d))))
await new Promise(r => ws.once('open', r))

const s0 = await wait(m => m.t === 'settings', 5000)
ok('settings awal', s0.settings.source === 'personal' && s0.settings.compactWindow === 200000, s0.settings.sources.map((x: any) => `${x.id}:${x.ready}`))
const planMsg = await wait(m => m.t === 'plan' && m.plan, 45000)
ok('kuota disiarkan tanpa sesi berjalan', planMsg.plan.session !== undefined, [planMsg.plan.session?.utilization, planMsg.plan.weekly?.[0]?.utilization])

let mark = seen.length
out({ t: 'setCompactWindow', tokens: 123 })
await wait(m => m.t === 'error', 3000, mark)
ok('ukuran autocompact asing ditolak', true)
mark = seen.length
out({ t: 'setCompactWindow', tokens: 100000 })
ok('autocompact 100k tersimpan', (await wait(m => m.t === 'settings', 3000, mark)).settings.compactWindow === 100000)
mark = seen.length
out({ t: 'setSource', source: 'produk' })
ok('Produk belum login ditolak', /Belum login/.test((await wait(m => m.t === 'error', 3000, mark)).message))

// sesi baru di Personal
mark = seen.length
out({ t: 'send', ref: 'a', cwd: work, text: 'Balas persis: satu', model: 'haiku' })
const id = (await wait(m => m.t === 'started', 90000, mark)).sessionId
out({ t: 'subscribe', sessionId: id, lastSeq: -1 })
await wait(m => m.t === 'status' && m.sessionId === id && m.status === 'idle', 90000, mark)
const tk = seen.slice(mark).filter(m => m.t === 'tokens' && m.total)
ok('token mengalir', tk.length > 0, tk.map(m => m.total))

// ganti ke Merapi: proses lama ditutup, pesan berikutnya lewat gateway pada sesi yang sama
mark = seen.length
out({ t: 'setSource', source: 'merapi' })
ok('sumber Merapi tersimpan', (await wait(m => m.t === 'settings', 3000, mark)).settings.source === 'merapi')
ok('kuota kosong di Merapi', (await wait(m => m.t === 'plan', 3000, mark)).plan === null)
await wait(m => m.t === 'status' && m.sessionId === id && m.status === 'closed', 15000, mark)
mark = seen.length
out({ t: 'send', ref: 'b', sessionId: id, text: 'Balas persis: dua' })
await wait(m => m.t === 'status' && m.sessionId === id && m.status === 'idle', 120000, mark)
const st = seen.slice(mark).filter(m => m.t === 'status' && m.sessionId === id).at(-1)
const reply = seen.slice(mark).filter(m => m.t === 'event' && m.item.k === 'assistant').map(m => m.item.text)
ok('Merapi melanjutkan sesi', reply.length > 0 && st.model === 'gpt-6-luna', [reply, st.model])

// kembali ke Personal, pesan datang tepat saat proses ditutup tidak hilang
mark = seen.length
out({ t: 'setSource', source: 'personal' })
out({ t: 'send', ref: 'c', sessionId: id, text: 'Balas persis: tiga' })
await wait(m => m.t === 'status' && m.sessionId === id && m.status === 'idle' && seen.slice(mark).some(x => x.t === 'event' && x.item.k === 'assistant'), 120000, mark)
const r3 = seen.slice(mark).filter(m => m.t === 'event' && m.item.k === 'assistant').map(m => m.item.text)
ok('pesan saat ganti sumber tetap terkirim', r3.length > 0, r3)

// menganggur: server meringkas lalu menutup sesi sendiri (ITSVIBES_IDLE_MIN kecil)
mark = seen.length
const closed = await wait(m => m.t === 'status' && m.sessionId === id && m.status === 'closed', 240000, mark)
const boundary = seen.slice(mark).find(m => m.t === 'event' && m.item.k === 'system' && /diringkas/.test(m.item.text))
ok('menganggur: compact lalu tutup', !!closed && !!boundary, seen.slice(mark).filter(m => m.t === 'tokens').map(m => m.total))
console.log('SESI', id)
ws.close()
process.exit()
