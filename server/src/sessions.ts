import fs from 'node:fs'
import path from 'node:path'
import { LIVE_DIR, PROJECTS_DIR, STATE_DIR } from './config.ts'
import type { ChatItem, HistoryPage } from '../../shared/protocol.ts'

// Membaca sesi Claude Code langsung dari ~/.claude/projects/<proyek>/<id>.jsonl, sama seperti menu /resume.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SDK_ENTRYPOINTS = new Set(['sdk-cli', 'sdk-ts', 'sdk-py'])

export interface SessionFile { id: string; file: string; project: string; size: number; mtime: number }
interface Meta { size: number; mtime: number; title: string; source: 'custom' | 'ai' | 'prompt'; cwd: string; sdk: boolean }

const META_FILE = path.join(STATE_DIR, 'meta-cache.json')
const CREATED_FILE = path.join(STATE_DIR, 'created.json')

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file + '.tmp', JSON.stringify(data))
  fs.renameSync(file + '.tmp', file)
}

const metaCache: Record<string, Meta> = readJson(META_FILE, {})
let metaDirty = false
setInterval(() => {
  if (metaDirty) {
    metaDirty = false
    writeJson(META_FILE, metaCache)
  }
}, 10_000).unref()

// Sesi yang dibuat dari itsvibes tercatat sebagai sdk-ts oleh Claude Code; dicatat di sini supaya tidak
// ikut disembunyikan bersama sesi otomatis (Hermes dan sejenisnya)
const created = new Set<string>(readJson<string[]>(CREATED_FILE, []))
export function markCreated(id: string) {
  created.add(id)
  writeJson(CREATED_FILE, [...created])
}

export function listFiles(): SessionFile[] {
  const byId = new Map<string, SessionFile>()
  let dirs: fs.Dirent[] = []
  try {
    dirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
  } catch {
    return []
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    const dir = path.join(PROJECTS_DIR, d.name)
    let names: string[] = []
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const n of names) {
      if (!n.endsWith('.jsonl') || !UUID.test(n.slice(0, -6))) continue
      const file = path.join(dir, n)
      let st: fs.Stats
      try {
        st = fs.statSync(file)
      } catch {
        continue
      }
      const id = n.slice(0, -6)
      const prev = byId.get(id)
      if (!prev || prev.mtime < st.mtimeMs) byId.set(id, { id, file, project: d.name, size: st.size, mtime: st.mtimeMs })
    }
  }
  return [...byId.values()]
}

// Menghapus sesi sungguhan: berkas JSONL dan folder pendampingnya (subagent, hasil tool). Id sudah lolos UUID lewat findFile.
export function deleteSessionFiles(f: SessionFile) {
  fs.rmSync(f.file, { force: true })
  fs.rmSync(path.join(path.dirname(f.file), f.id), { recursive: true, force: true })
  delete metaCache[f.file]
  metaDirty = true
}

export function findFile(id: string): SessionFile | undefined {
  if (!UUID.test(id)) return undefined
  return listFiles().find(f => f.id === id)
}

function readHead(file: string, bytes = 256 * 1024): string {
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const n = fs.readSync(fd, buf, 0, bytes, 0)
    return buf.subarray(0, n).toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

function firstString(text: string, key: string): string | undefined {
  const m = new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`).exec(text)
  if (!m) return undefined
  try {
    return JSON.parse(`"${m[1]}"`) as string
  } catch {
    return m[1]
  }
}

// Judul seperti menu /resume: hasil /rename (customTitle) didahulukan, lalu judul buatan AI, lalu pesan pertama.
// Dicari dari ujung berkas per potongan 4 MB, karena baris judul ditambahkan belakangan.
// `from` > 0: cukup pindai bagian yang baru ditambahkan sejak cache terakhir (sesi yang sedang berjalan)
function findTitle(file: string, size: number, from = 0): { custom?: string; ai?: string } {
  const custom = /"customTitle":"((?:[^"\\]|\\.)*)"/g
  const ai = /"aiTitle":"((?:[^"\\]|\\.)*)"/g
  const chunk = 4 << 20
  const overlap = 1 << 16
  let aiTitle: string | undefined
  const fd = fs.openSync(file, 'r')
  try {
    let end = size
    while (end > from) {
      const start = Math.max(0, end - chunk)
      const len = Math.min(size, end + overlap) - start
      const buf = Buffer.alloc(len)
      fs.readSync(fd, buf, 0, len, start)
      const s = buf.toString('latin1')
      const last = (re: RegExp) => {
        let m: RegExpExecArray | null, found: string | undefined
        re.lastIndex = 0
        while ((m = re.exec(s))) found = m[1]
        return found
      }
      const decode = (raw: string) => {
        try {
          return JSON.parse(`"${Buffer.from(raw, 'latin1').toString('utf8')}"`) as string
        } catch {
          return raw
        }
      }
      const c = last(custom)
      if (c !== undefined) return { custom: decode(c), ai: aiTitle }
      if (aiTitle === undefined) {
        const a = last(ai)
        if (a !== undefined) aiTitle = decode(a)
      }
      end = start
    }
  } finally {
    fs.closeSync(fd)
  }
  return { ai: aiTitle }
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.filter(b => b && b.type === 'text').map(b => String(b.text ?? '')).join(' ')
  }
  return ''
}

function firstPrompt(head: string): string {
  for (const line of head.split('\n')) {
    if (!line.includes('"type":"user"')) continue
    try {
      const d = JSON.parse(line)
      if (d.type !== 'user' || d.isMeta) continue
      const t = textOf(d.message?.content).trim()
      if (t && !t.startsWith('<')) return t.replace(/\s+/g, ' ').slice(0, 80)
    } catch {
      // baris terakhir head bisa terpotong
    }
  }
  return ''
}

export function meta(f: SessionFile): Meta {
  const cached = metaCache[f.file]
  if (cached && cached.size === f.size && cached.mtime === f.mtime) return cached
  let fileTitle = ''
  try {
    fileTitle = JSON.parse(fs.readFileSync(path.join(path.dirname(f.file), f.id, 'custom-title.json'), 'utf8')).customTitle ?? ''
  } catch {
    // tidak semua sesi punya custom-title.json
  }
  let m: Meta
  if (cached?.source && f.size >= cached.size) {
    // berkas hanya bertambah: judul lama tetap berlaku kecuali ada /rename atau judul AI baru di bagian tambahan
    const t = findTitle(f.file, f.size, Math.max(0, cached.size - (1 << 16)))
    m = { ...cached, size: f.size, mtime: f.mtime }
    if (fileTitle || t.custom) Object.assign(m, { title: fileTitle || t.custom, source: 'custom' })
    else if (t.ai && cached.source !== 'custom') Object.assign(m, { title: t.ai, source: 'ai' })
  } else {
    const head = readHead(f.file)
    const t = fileTitle ? { custom: fileTitle } : findTitle(f.file, f.size)
    const entry = firstString(head, 'entrypoint')
    m = {
      size: f.size,
      mtime: f.mtime,
      title: t.custom ?? t.ai ?? firstPrompt(head),
      source: t.custom ? 'custom' : t.ai ? 'ai' : 'prompt',
      cwd: firstString(head, 'cwd') ?? '',
      sdk: entry !== undefined && SDK_ENTRYPOINTS.has(entry),
    }
  }
  metaCache[f.file] = m
  metaDirty = true
  return m
}

export function isAutomated(id: string, m: Meta) {
  return m.sdk && !created.has(id)
}

// Sesi yang sedang terbuka di proses Claude Code lain di Bima (terminal biasa): ~/.claude/sessions/<pid>.json
// dengan proses yang masih hidup. Proses anak itsvibes sendiri tidak dihitung.
function procStat(pid: number): string[] | null {
  try {
    return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').pop()!.split(' ')
  } catch {
    return null
  }
}

function isOurs(pid: number): boolean {
  for (let p = pid, i = 0; p > 1 && i < 8; i++) {
    if (p === process.pid) return true
    const st = procStat(p)
    if (!st) return false
    p = Number(st[1]) // ppid
  }
  return false
}

export function liveElsewhere(): Map<string, number> {
  const live = new Map<string, number>()
  let names: string[] = []
  try {
    names = fs.readdirSync(LIVE_DIR)
  } catch {
    return live
  }
  for (const n of names) {
    if (!n.endsWith('.json')) continue
    try {
      const d = JSON.parse(fs.readFileSync(path.join(LIVE_DIR, n), 'utf8'))
      const pid = Number(d.pid)
      const st = procStat(pid)
      if (!st || !d.sessionId) continue
      if (d.procStart !== undefined && String(d.procStart) !== st[19]) continue
      if (!isOurs(pid)) live.set(d.sessionId, pid)
    } catch {
      continue
    }
  }
  return live
}

// Token konteks terakhir sesi yang tidak berjalan: usage panggilan terakhir, atau hasil compact kalau lebih baru
export function lastContextTokens(f: SessionFile): number {
  let lines: string[]
  try {
    const fd = fs.openSync(f.file, 'r')
    try {
      const n = Math.min(f.size, 8 << 20)
      const buf = Buffer.alloc(n)
      fs.readSync(fd, buf, 0, n, f.size - n)
      lines = buf.toString('utf8').split('\n')
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return 0
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]
    if (!l.includes('"compact_boundary"') && !l.includes('"cache_read_input_tokens"')) continue
    try {
      const d = JSON.parse(l)
      if (d.type === 'system' && d.subtype === 'compact_boundary' && d.compactMetadata?.postTokens) return d.compactMetadata.postTokens
      const u = d.type === 'assistant' && !d.isSidechain ? d.message?.usage : null
      const total = u ? (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) : 0
      if (total) return total
    } catch {
      // baris pertama di jendela bisa terpotong
    }
  }
  return 0
}

// ---------- riwayat percakapan ----------

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + `… (+${s.length - n} karakter)` : s)

export function toolSummary(name: string, input: Record<string, unknown>): string {
  const pick = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const s = pick('description') || pick('command') || pick('file_path') || pick('pattern') || pick('url') ||
    pick('query') || pick('skill') || pick('prompt') || pick('subject')
  return clip(s.replace(/\s+/g, ' ').trim(), 160) || name
}

// Isi langkah saat dibuka: judulnya sudah tampil, jadi cukup perintah atau argumen utamanya
function toolDetail(input: Record<string, unknown>, name: string): string {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const diff = (a: string, sign: string) => a.split('\n').map(l => `${sign} ${l}`).join('\n')
  if (name === 'Edit') return clip([str('file_path'), diff(str('old_string'), '-'), diff(str('new_string'), '+')].join('\n'), 8000)
  if (name === 'Write') return clip(`${str('file_path')}\n${str('content')}`, 8000)
  const main = str('command') || str('file_path') || str('pattern') || str('url') || str('query') || str('prompt') || str('skill')
  if (main) return clip(main, 8000)
  return clip(Object.entries(input).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n'), 8000)
}

const lineCount = (s: unknown) => (typeof s === 'string' && s.length ? s.split('\n').length : 0)

// jumlah baris ditambah/dihapus untuk label "+2 -2" pada langkah edit
function editStats(name: string, input: Record<string, unknown>): { added?: number; removed?: number } {
  if (name === 'Edit') return { added: lineCount(input.new_string), removed: lineCount(input.old_string) }
  if (name === 'Write') return { added: lineCount(input.content), removed: 0 }
  if (name === 'MultiEdit' && Array.isArray(input.edits)) {
    let added = 0, removed = 0
    for (const e of input.edits as Record<string, unknown>[]) {
      added += lineCount(e?.new_string)
      removed += lineCount(e?.old_string)
    }
    return { added, removed }
  }
  return {}
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(b => (b?.type === 'text' ? String(b.text ?? '') : b?.type === 'image' ? '[gambar]' : '')).join('\n')
  }
  return ''
}

function commandText(s: string): string | null {
  const name = /<command-name>([\s\S]*?)<\/command-name>/.exec(s)?.[1]
  if (name) {
    const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(s)?.[1]?.trim()
    return `${name.trim()}${args ? ' ' + args : ''}`
  }
  const out = /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/.exec(s)?.[1]
  if (out !== undefined) return clip(out.replace(/\x1b\[[0-9;]*m/g, '').trim(), 1500) || null
  return null
}

// Satu baris JSONL (atau pesan SDK yang bentuknya sama) menjadi item chat untuk aplikasi
export function toItems(d: any): ChatItem[] {
  const ts: string = d.timestamp ?? new Date().toISOString()
  const base: string = d.uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const items: ChatItem[] = []
  if (d.type === 'system' && d.subtype === 'compact_boundary') {
    return [{ k: 'system', id: base, ts, text: 'Percakapan diringkas (compact)' }]
  }
  if (d.type === 'user') {
    if (d.isMeta) return []
    const c = d.message?.content
    if (d.isCompactSummary) return [{ k: 'system', id: base, ts, text: 'Ringkasan percakapan sebelumnya dimuat' }]
    if (typeof c === 'string') {
      const cmd = c.startsWith('<') ? commandText(c) : null
      if (cmd !== null) return [{ k: 'system', id: base, ts, text: cmd }]
      if (c.startsWith('<')) return []
      return [{ k: 'user', id: base, ts, text: c }]
    }
    if (Array.isArray(c)) {
      const texts: string[] = []
      let images = 0
      c.forEach((b: any, i: number) => {
        if (b?.type === 'text') {
          const t = String(b.text ?? '')
          if (!t.startsWith('<system-reminder>') && !t.startsWith('<')) texts.push(t)
        } else if (b?.type === 'image') images++
        else if (b?.type === 'tool_result') {
          items.push({
            k: 'tool_result', id: `${base}-${i}`, ts, toolUseId: String(b.tool_use_id ?? ''),
            text: clip(resultText(b.content), 3000), isError: !!b.is_error,
          })
        }
      })
      if (texts.length || images) items.unshift({ k: 'user', id: base, ts, text: texts.join('\n'), ...(images ? { images } : {}) })
    }
    return items
  }
  if (d.type === 'assistant') {
    const c = d.message?.content
    if (!Array.isArray(c)) return []
    c.forEach((b: any, i: number) => {
      const id = `${base}-${i}`
      if (b?.type === 'text' && String(b.text ?? '').trim()) items.push({ k: 'assistant', id, ts, text: String(b.text) })
      else if (b?.type === 'thinking' && String(b.thinking ?? '').trim()) items.push({ k: 'thinking', id, ts, text: clip(String(b.thinking), 4000) })
      else if (b?.type === 'tool_use') {
        const input = (b.input ?? {}) as Record<string, unknown>
        items.push({
          k: 'tool', id: String(b.id ?? id), ts, name: String(b.name ?? 'tool'),
          summary: toolSummary(String(b.name ?? ''), input), input: clip(JSON.stringify(input, null, 1), 2000),
          detail: toolDetail(input, String(b.name ?? '')),
          ...editStats(String(b.name ?? ''), input),
        })
      }
    })
    return items
  }
  return []
}

// Dibaca dari belakang per potongan 1 MB sampai cukup item, jadi sesi ratusan MB tetap cepat dibuka
export function history(f: SessionFile, before: number | undefined, limit: number): HistoryPage {
  const fd = fs.openSync(f.file, 'r')
  try {
    let end = Math.min(before ?? f.size, f.size)
    let carry = Buffer.alloc(0)
    const collected: ChatItem[][] = []
    let count = 0
    let earliest = end
    while (end > 0 && count < limit) {
      const start = Math.max(0, end - (1 << 20))
      const buf = Buffer.alloc(end - start)
      fs.readSync(fd, buf, 0, buf.length, start)
      const data = Buffer.concat([buf, carry])
      let cut = 0
      if (start > 0) {
        // baris pertama potongan ini mulai sebelum `start`: simpan untuk digabung dengan potongan sebelumnya.
        // Kalau potongan tidak punya baris baru sama sekali (baris gambar base64 bisa > 1 MB), simpan semuanya.
        const nl = buf.indexOf(10)
        if (nl < 0) {
          carry = data
          end = start
          continue
        }
        cut = nl + 1
      }
      carry = data.subarray(0, cut)
      const lines = data.subarray(cut).toString('utf8').split('\n')
      const chunkItems: ChatItem[] = []
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          chunkItems.push(...toItems(JSON.parse(line)))
        } catch {
          continue
        }
      }
      collected.unshift(chunkItems)
      count += chunkItems.length
      earliest = start + cut
      end = start
    }
    // tidak dipotong ke `limit`: halaman berikutnya mulai dari `earliest`, jadi item yang dipotong akan hilang
    return { items: collected.flat(), before: earliest > 0 ? earliest : null }
  } finally {
    fs.closeSync(fd)
  }
}
