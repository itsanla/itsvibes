// Uji hapus sesi massal tanpa memakai token. Pakai: ITSVIBES_URL=ws://127.0.0.1:6799 ITSVIBES_TOKEN=... node test/delete-sessions.ts
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WebSocket } from 'ws'

const dir = path.join(os.homedir(), '.claude/projects/-tmp-ivt-del')
fs.mkdirSync(dir, { recursive: true })
const line = JSON.stringify({ type: 'user', message: { role: 'user', content: 'uji' }, cwd: '/tmp' }) + '\n'
const a = crypto.randomUUID(), b = crypto.randomUUID()
for (const id of [a, b]) fs.writeFileSync(path.join(dir, `${id}.jsonl`), line)
fs.mkdirSync(path.join(dir, a, 'subagents'), { recursive: true })
fs.writeFileSync(path.join(dir, a, 'subagents/x.jsonl'), line)
const canary = path.join(dir, 'keep.txt')
fs.writeFileSync(canary, 'x')

const ws = new WebSocket(`${process.env.ITSVIBES_URL}/ws?role=app&token=${encodeURIComponent(process.env.ITSVIBES_TOKEN!)}`)
await new Promise(r => ws.once('open', r))
const reply = new Promise<any>(r => ws.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'sessionsDeleted') r(m) }))
ws.send(JSON.stringify({ t: 'deleteSessions', ids: [a, b, crypto.randomUUID(), '../keep', 'memory'] }))
const res = await reply
const ok = (n: string, c: boolean, i: unknown = '') => { console.log(`${c ? 'OK  ' : 'GAGAL'} ${n}`, i); if (!c) process.exitCode = 1 }
ok('dua sesi terhapus', res.deleted.length === 2 && res.deleted.includes(a) && res.deleted.includes(b))
ok('id asing dan path dilewati', res.skipped.length === 3, res.skipped.map((x: any) => x.reason))
ok('jsonl hilang', !fs.existsSync(path.join(dir, `${a}.jsonl`)) && !fs.existsSync(path.join(dir, `${b}.jsonl`)))
ok('folder pendamping hilang', !fs.existsSync(path.join(dir, a)))
ok('berkas lain utuh', fs.existsSync(canary))
fs.rmSync(dir, { recursive: true })
ws.close()
process.exit()
