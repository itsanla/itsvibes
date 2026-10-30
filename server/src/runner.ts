import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { PermissionResult, PermissionUpdate, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { CLAUDE_BIN, DEFAULT_CWD, IDLE_MS, STATE_DIR } from './config.ts'
import { findFile, liveElsewhere, markCreated, meta, toItems, toolSummary } from './sessions.ts'
import type {
  Answer, ChatItem, ContextInfo, EffortLevel, ImageAttachment, ModelOption, PendingRequest, PermissionMode, PlanInfo,
  PlanWindow, Question, ServerMessage, SessionStatus,
} from '../../shared/protocol.ts'

// Satu Run = satu proses Claude Code (binary resmi di Bima, lewat Agent SDK) yang membawa satu sesi.
// Pesan dari HP masuk lewat Inbox; semua keluaran diubah jadi ChatItem dan disiarkan ke HP.

const BUFFER = 3000
// permintaan Aan: sesi dari itsvibes default tanpa izin (setara --dangerously-skip-permissions); bisa diganti per sesi dari HP
const DEFAULT_MODE: PermissionMode = 'bypassPermissions'

class Inbox implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = []
  private waiters: ((r: IteratorResult<SDKUserMessage>) => void)[] = []
  private closed = false
  push(m: SDKUserMessage) {
    if (this.closed) return
    const w = this.waiters.shift()
    if (w) w({ value: m, done: false })
    else this.items.push(m)
  }
  close() {
    this.closed = true
    for (const w of this.waiters.splice(0)) w({ value: undefined, done: true })
  }
  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift()!, done: false })
        if (this.closed) return Promise.resolve({ value: undefined, done: true })
        return new Promise(r => this.waiters.push(r))
      },
    }
  }
}

interface Pending {
  req: PendingRequest
  input: Record<string, unknown>
  suggestions?: PermissionUpdate[]
  resolve: (r: PermissionResult) => void
}

export interface HubEvents {
  // siarkan ke koneksi yang berlangganan sesi ini (sessionId '' = belum diketahui)
  toSubscribers(sessionId: string, msg: ServerMessage): void
  toAll(msg: ServerMessage): void
  notify(sessionId: string, kind: 'done' | 'request' | 'error', title: string, body: string): void
  started(ref: string, sessionId: string): void
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

// itsvibes selalu memakai login langganan claude.ai di Bima. API key dan variabel dari sesi Claude Code
// induk (kalau server dijalankan dari dalam Claude Code) dibuang supaya tidak mengambil alih login itu.
function childEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    if (k === 'ANTHROPIC_API_KEY' || k === 'ANTHROPIC_AUTH_TOKEN' || k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_')) continue
    env[k] = v
  }
  return env
}

export class Run {
  sessionId = ''
  readonly cwd: string
  status: SessionStatus = 'starting'
  mode: PermissionMode
  seq = 0
  buffer: ServerMessage[] = []
  pending = new Map<string, Pending>()
  lastActivity = Date.now()
  private inbox = new Inbox()
  private q: Query
  private lastText = ''
  private title = ''
  private hub: Hub
  model = '' // pilihan model (alias seperti "opus") atau model yang dilaporkan Claude Code saat mulai
  effort: EffortLevel | undefined

  constructor(
    hub: Hub,
    opts: {
      sessionId?: string; cwd: string; mode: PermissionMode; ref?: string; title?: string; model?: string; effort?: EffortLevel
    },
  ) {
    this.hub = hub
    this.cwd = opts.cwd
    this.mode = opts.mode
    this.title = opts.title ?? ''
    if (opts.model && opts.model !== 'default') this.model = opts.model
    this.effort = opts.effort
    if (opts.sessionId) this.sessionId = opts.sessionId
    this.q = query({
      prompt: this.inbox,
      options: {
        cwd: this.cwd,
        resume: opts.sessionId,
        model: this.model || undefined,
        effort: this.effort,
        pathToClaudeCodeExecutable: CLAUDE_BIN,
        env: childEnv(),
        includePartialMessages: true,
        permissionMode: this.mode,
        allowDangerouslySkipPermissions: true, // supaya mode bypass bisa dipilih dari HP
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        canUseTool: (toolName, input, o) => this.ask(toolName, input, o),
        stderr: d => process.stderr.write(`[claude ${this.sessionId.slice(0, 8) || 'baru'}] ${d}`),
      },
    })
    void this.loop(opts.ref)
  }

  private emit(msg: ServerMessage) {
    this.buffer.push(msg)
    if (this.buffer.length > BUFFER) this.buffer.splice(0, this.buffer.length - BUFFER)
    this.hub.events.toSubscribers(this.sessionId, msg)
  }

  private item(item: ChatItem) {
    this.emit({ t: 'event', sessionId: this.sessionId, seq: ++this.seq, item })
  }

  statusMessage(): ServerMessage {
    return {
      t: 'status', sessionId: this.sessionId, status: this.status, mode: this.mode,
      pending: [...this.pending.values()].map(p => p.req), seq: this.seq, model: this.model || undefined,
      effort: this.effort,
    }
  }

  private setStatus(s: SessionStatus) {
    this.status = s
    if (this.sessionId) this.hub.events.toAll(this.statusMessage())
  }

  private get label() {
    return this.title || this.lastPrompt || this.sessionId.slice(0, 8)
  }
  private lastPrompt = ''

  send(text: string, images: ImageAttachment[] = []) {
    this.lastActivity = Date.now()
    if (!this.title) this.lastPrompt ||= clip(text.replace(/\s+/g, ' '), 60) || 'Foto'
    const content = images.length
      ? [
          ...images.map(i => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mediaType, data: i.data } })),
          ...(text ? [{ type: 'text' as const, text }] : []),
        ]
      : text
    this.inbox.push({
      type: 'user',
      message: { role: 'user', content },
      parent_tool_use_id: null,
      origin: { kind: 'human' },
    } as SDKUserMessage)
    this.item({
      k: 'user', id: crypto.randomUUID(), ts: new Date().toISOString(), text,
      ...(images.length ? { images: images.length } : {}),
    })
    this.setStatus(this.pending.size ? 'waiting' : 'running')
  }

  private async loop(ref?: string) {
    try {
      for await (const m of this.q) {
        this.lastActivity = Date.now()
        this.handle(m, ref)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.emit({ t: 'error', sessionId: this.sessionId, message: msg })
      this.hub.events.notify(this.sessionId, 'error', `Error · ${this.label}`, clip(msg, 200))
    } finally {
      for (const p of this.pending.values()) p.resolve({ behavior: 'deny', message: 'Sesi dihentikan' })
      this.pending.clear()
      this.setStatus('closed')
      this.hub.remove(this)
    }
  }

  private handle(m: SDKMessage, ref?: string) {
    if (m.type === 'system' && m.subtype === 'init') {
      if (!this.sessionId) {
        this.sessionId = m.session_id
        markCreated(m.session_id)
        this.hub.register(this)
        // item yang tercatat sebelum id diketahui (pesan pertama) diberi id sesi lalu disiarkan ulang lewat replay
        for (const b of this.buffer) if ('sessionId' in b) (b as { sessionId: string }).sessionId = m.session_id
        if (ref) this.hub.events.started(ref, m.session_id)
      }
      const mode = (m as { permissionMode?: PermissionMode }).permissionMode
      if (mode) this.mode = mode
      this.model ||= m.model
      this.hub.learnModels(this)
      this.setStatus(this.pending.size ? 'waiting' : 'running')
      return
    }
    if (m.type === 'stream_event') {
      const ev = m.event as { type: string; delta?: { type: string; text?: string } }
      if (m.parent_tool_use_id === null && ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
        this.emit({ t: 'delta', sessionId: this.sessionId, seq: ++this.seq, text: ev.delta.text })
      }
      return
    }
    if (m.type === 'assistant') {
      if (m.parent_tool_use_id !== null) return // pesan subagent tidak ditampilkan, sama seperti terminal
      for (const it of toItems({ type: 'assistant', message: m.message, uuid: m.uuid, timestamp: new Date().toISOString() })) {
        if (it.k === 'assistant') this.lastText = it.text
        this.item(it)
      }
      return
    }
    if (m.type === 'user') {
      if (m.parent_tool_use_id !== null) return
      for (const it of toItems({ type: 'user', message: m.message, uuid: m.uuid, timestamp: new Date().toISOString() })) {
        if (it.k === 'tool_result') this.item(it)
      }
      return
    }
    if (m.type === 'system' && m.subtype === 'compact_boundary') {
      this.item({ k: 'system', id: m.uuid, ts: new Date().toISOString(), text: 'Percakapan diringkas (compact)' })
      return
    }
    if (m.type === 'result') {
      this.setStatus(this.pending.size ? 'waiting' : 'idle')
      if (m.subtype === 'success') {
        this.hub.events.notify(this.sessionId, 'done', `Selesai · ${this.label}`, clip((this.lastText || m.result || 'Selesai').replace(/\s+/g, ' '), 200))
      } else {
        const why = ('errors' in m && Array.isArray(m.errors) ? m.errors.join('; ') : '') || m.subtype
        this.item({ k: 'system', id: m.uuid, ts: new Date().toISOString(), text: `Berhenti: ${why}` })
        this.hub.events.notify(this.sessionId, 'error', `Berhenti · ${this.label}`, clip(why, 200))
      }
      this.lastText = ''
    }
  }

  private ask(
    toolName: string,
    input: Record<string, unknown>,
    o: { signal: AbortSignal; suggestions?: PermissionUpdate[]; decisionReason?: string; mcpServer?: { name: string } },
  ): Promise<PermissionResult> {
    const id = crypto.randomBytes(4).toString('hex')
    const kind = toolName === 'AskUserQuestion' ? 'question' : toolName === 'ExitPlanMode' ? 'plan' : 'permission'
    const req: PendingRequest = {
      id,
      sessionId: this.sessionId,
      kind,
      toolName,
      summary: kind === 'question' ? 'Claude bertanya' : kind === 'plan' ? 'Setujui rencana?' : `${toolName}: ${toolSummary(toolName, input)}`,
      input: clip(JSON.stringify(input, null, 1), 3000),
      questions: kind === 'question' ? (input.questions as Question[]) : undefined,
      plan: kind === 'plan' ? String(input.plan ?? '') : undefined,
      canRemember: kind === 'permission' && !!o.suggestions?.length,
      createdAt: Date.now(),
    }
    return new Promise<PermissionResult>(resolve => {
      this.pending.set(id, { req, input, suggestions: o.suggestions, resolve })
      o.signal.addEventListener('abort', () => {
        if (!this.pending.delete(id)) return
        resolve({ behavior: 'deny', message: 'Dibatalkan' })
        this.setStatus(this.pending.size ? 'waiting' : 'running')
      })
      this.setStatus('waiting')
      const body = kind === 'question'
        ? clip((req.questions ?? []).map(q => q.question).join(' / '), 200)
        : kind === 'plan' ? 'Claude menunggu persetujuan rencana' : req.summary
      this.hub.events.notify(this.sessionId, 'request', `${kind === 'question' ? 'Claude bertanya' : 'Butuh izin'} · ${this.label}`, body)
    })
  }

  answer(a: Answer): boolean {
    const p = this.pending.get(a.requestId)
    if (!p) return false
    this.pending.delete(a.requestId)
    this.lastActivity = Date.now()
    const denyMsg = a.message?.trim() || 'Ditolak lewat itsvibes'
    if (a.behavior === 'deny') {
      p.resolve({ behavior: 'deny', message: denyMsg })
    } else if (p.req.kind === 'question') {
      p.resolve({ behavior: 'allow', updatedInput: { questions: p.input.questions, answers: a.answers ?? {} } })
    } else {
      p.resolve({
        behavior: 'allow',
        updatedInput: p.input,
        // "izinkan selalu" berlaku untuk sisa sesi ini saja, tidak ditulis ke berkas settings
        updatedPermissions: a.remember && p.suggestions ? p.suggestions.map(s => ({ ...s, destination: 'session' as const })) : undefined,
      })
    }
    this.setStatus(this.pending.size ? 'waiting' : 'running')
    return true
  }

  async interrupt() {
    await this.q.interrupt().catch(() => undefined)
  }

  async setMode(mode: PermissionMode) {
    await this.q.setPermissionMode(mode)
    this.mode = mode
    this.setStatus(this.status)
  }

  async setModel(model: string) {
    await this.q.setModel(model === 'default' ? undefined : model)
    this.model = model === 'default' ? '' : model
    this.setStatus(this.status)
  }

  async setEffort(effort: EffortLevel | 'default') {
    await this.q.applyFlagSettings({ effortLevel: effort === 'default' ? null : effort })
    this.effort = effort === 'default' ? undefined : effort
    this.setStatus(this.status)
  }

  supportedModels() {
    return this.q.supportedModels()
  }

  async contextUsage(): Promise<ContextInfo> {
    const u = await this.q.getContextUsage()
    return {
      model: u.model, total: u.totalTokens, max: u.maxTokens, percentage: u.percentage,
      categories: u.categories.map(c => ({ id: c.id, name: c.name, tokens: c.tokens, kind: c.kind })),
      mcpTools: Array.isArray(u.mcpTools) ? u.mcpTools.length : 0,
    }
  }

  planUsage() {
    return planFrom(this.q)
  }

  stop() {
    this.inbox.close()
    setTimeout(() => this.q.close(), 5000).unref()
  }
}

const PREFS_FILE = path.join(STATE_DIR, 'models.json')
const MODELS_FILE = path.join(STATE_DIR, 'models-list.json')
// dipakai sampai ada sesi yang berjalan dan Claude Code melaporkan daftar model aslinya
const FALLBACK_MODELS: ModelOption[] = [
  { value: 'default', displayName: 'Default', description: 'Ikut pengaturan Claude Code di Bima' },
  { value: 'opus', displayName: 'Opus', description: 'Paling cakap untuk tugas berat' },
  { value: 'sonnet', displayName: 'Sonnet', description: 'Seimbang antara kecepatan dan kemampuan' },
  { value: 'haiku', displayName: 'Haiku', description: 'Paling cepat dan hemat' },
]

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 1))
  fs.renameSync(file + '.tmp', file)
}

interface Pref { model?: string; effort?: EffortLevel }

// models.json lama menyimpan string model saja per sesi
function loadPrefs(): Record<string, Pref> {
  const raw = readJson<Record<string, string | Pref>>(PREFS_FILE, {})
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? { model: v } : v]))
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms).unref())])
}

// API usage di SDK masih eksperimental: semua field dibaca dengan aman supaya perubahan bentuk tidak merusak server
async function planFrom(q: Query): Promise<PlanInfo | null> {
  const u = await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })
  const r = u?.rate_limits
  const win = (label: string, x?: { utilization: number | null; resets_at: string | null } | null): PlanWindow | null =>
    x ? { label, utilization: x.utilization ?? null, resetsAt: x.resets_at ?? null } : null
  if (!r) return { subscription: u?.subscription_type ?? null, session: null, weekly: [] }
  const weekly = [
    win('Semua model', r.seven_day),
    win('Opus', r.seven_day_opus),
    win('Sonnet', r.seven_day_sonnet),
    ...(r.model_scoped ?? []).map(m => win(m.display_name, m)),
  ].filter((w): w is PlanWindow => !!w)
  return { subscription: u.subscription_type, session: win('Sesi saat ini', r.five_hour), weekly }
}

// tanpa sesi yang berjalan: buka proses claude sebentar tanpa mengirim pesan (tidak memakai token) untuk membaca kuota
async function probePlan(): Promise<PlanInfo | null> {
  const inbox = new Inbox()
  const q = query({
    prompt: inbox,
    options: { cwd: DEFAULT_CWD, pathToClaudeCodeExecutable: CLAUDE_BIN, env: childEnv(), persistSession: false },
  })
  try {
    return await planFrom(q)
  } finally {
    inbox.close()
    q.close()
  }
}

export class Hub {
  runs = new Map<string, Run>()
  private fresh = new Set<Run>() // sesi baru yang belum punya id
  events: HubEvents
  // model dan upaya pilihan per sesi, dipakai lagi saat sesi itu dilanjutkan
  private prefs: Record<string, Pref> = loadPrefs()
  private modelList: ModelOption[] = readJson(MODELS_FILE, FALLBACK_MODELS)
  private modelsLearned = false
  private planCache: { at: number; plan: PlanInfo | null } | null = null
  constructor(events: HubEvents) {
    this.events = events
    setInterval(() => {
      for (const r of this.runs.values()) {
        if (r.status === 'idle' && !r.pending.size && Date.now() - r.lastActivity > IDLE_MS) r.stop()
      }
    }, 60_000).unref()
  }

  register(r: Run) {
    this.fresh.delete(r)
    this.runs.set(r.sessionId, r)
    if (r.model || r.effort) this.savePref(r.sessionId, { model: r.model || null, effort: r.effort ?? null })
  }

  pref(id: string): Pref {
    return this.prefs[id] ?? {}
  }

  // null menghapus pilihan (kembali ke pengaturan Claude Code)
  private savePref(id: string, patch: { model?: string | null; effort?: EffortLevel | null }) {
    const next: Pref = { ...this.prefs[id] }
    for (const [k, v] of Object.entries(patch) as [keyof Pref, string | null | undefined][]) {
      if (v === undefined) continue
      if (v === null || v === 'default') delete next[k]
      else (next as Record<string, string>)[k] = v
    }
    if (Object.keys(next).length) this.prefs[id] = next
    else delete this.prefs[id]
    writeJson(PREFS_FILE, this.prefs)
  }

  private closedStatus(sessionId: string): ServerMessage {
    const p = this.pref(sessionId)
    return { t: 'status', sessionId, status: liveElsewhere().has(sessionId) ? 'terminal' : 'closed', pending: [], model: p.model, effort: p.effort }
  }

  models(): ModelOption[] {
    return this.modelList
  }

  // daftar model asli dari Claude Code, diambil sekali dari sesi pertama yang berjalan
  learnModels(r: Run) {
    if (this.modelsLearned) return
    this.modelsLearned = true
    r.supportedModels()
      .then(list => {
        if (!list.length) return
        this.modelList = list.map(m => ({
          value: m.value, displayName: m.displayName, description: m.description,
          supportsEffort: m.supportsEffort, efforts: m.supportedEffortLevels,
        }))
        writeJson(MODELS_FILE, this.modelList)
        this.events.toAll({ t: 'models', models: this.modelList })
      })
      .catch(() => (this.modelsLearned = false))
  }

  async setModel(sessionId: string, model: string): Promise<ServerMessage> {
    this.savePref(sessionId, { model })
    const r = this.runs.get(sessionId)
    if (!r) return this.closedStatus(sessionId)
    await r.setModel(model)
    return r.statusMessage()
  }

  async setEffort(sessionId: string, effort: EffortLevel | 'default'): Promise<ServerMessage> {
    this.savePref(sessionId, { effort: effort === 'default' ? null : effort })
    const r = this.runs.get(sessionId)
    if (!r) return this.closedStatus(sessionId)
    await r.setEffort(effort)
    return r.statusMessage()
  }

  // konteks hanya ada untuk sesi yang sedang berjalan; kuota paket berlaku untuk seluruh akun
  async usage(sessionId?: string): Promise<{ context: ContextInfo | null; plan: PlanInfo | null }> {
    const r = sessionId ? this.runs.get(sessionId) : undefined
    const context = r ? await withTimeout(r.contextUsage(), 20_000).catch(() => null) : null
    if (!this.planCache || Date.now() - this.planCache.at > 30_000) {
      const any = r ?? [...this.runs.values()][0]
      const plan = await withTimeout(any ? any.planUsage() : probePlan(), 30_000).catch(() => null)
      this.planCache = { at: Date.now(), plan }
    }
    return { context, plan: this.planCache.plan }
  }

  remove(r: Run) {
    this.fresh.delete(r)
    if (this.runs.get(r.sessionId) === r) this.runs.delete(r.sessionId)
  }

  // Kirim pesan ke sesi yang sudah ada (dilanjutkan bila belum jalan) atau buat sesi baru
  send(opts: {
    ref: string; sessionId?: string; cwd?: string; text: string; images?: ImageAttachment[]; model?: string; effort?: EffortLevel
  }): string | null {
    const images = opts.images ?? []
    if (opts.sessionId) {
      const running = this.runs.get(opts.sessionId)
      if (running) {
        running.send(opts.text, images)
        return null
      }
      const pid = liveElsewhere().get(opts.sessionId)
      if (pid) return `Sesi ini sedang terbuka di terminal Bima (pid ${pid}). Tutup dulu di sana supaya riwayatnya tidak bercabang.`
      const f = findFile(opts.sessionId)
      if (!f) return 'Sesi tidak ditemukan'
      const m = meta(f)
      const p = this.pref(f.id)
      const r = new Run(this, { sessionId: f.id, cwd: realCwd(m.cwd), mode: DEFAULT_MODE, title: m.title, model: p.model, effort: p.effort })
      this.runs.set(f.id, r)
      r.send(opts.text, images)
      return null
    }
    // sesi baru dari tombol + dibuat di home (~), kecuali aplikasi menyebut folder lain
    const r = new Run(this, { cwd: realCwd(opts.cwd), mode: DEFAULT_MODE, ref: opts.ref, model: opts.model, effort: opts.effort })
    this.fresh.add(r)
    r.send(opts.text, images)
    return null
  }

  answer(a: Answer): boolean {
    for (const r of this.runs.values()) if (r.answer(a)) return true
    return false
  }
}

function realCwd(cwd: string | undefined): string {
  // sesi lama Bima tercatat dengan cwd /home/anla (kini symlink ke /home/itsanla); realpath membuat
  // Claude Code mencari sesi di folder proyek yang benar
  try {
    return fs.realpathSync(cwd || DEFAULT_CWD)
  } catch {
    return DEFAULT_CWD
  }
}
