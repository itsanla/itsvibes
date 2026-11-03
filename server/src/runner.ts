import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Options, PermissionResult, PermissionUpdate, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { BROWSER_ENABLED, BROWSER_PORT, CLAUDE_BIN, DEFAULT_CWD, IDLE_MS, MIN_COMPACT_TOKENS, STATE_DIR } from './config.ts'
import { deleteSessionFiles, findFile, lastContextTokens, liveElsewhere, markCreated, meta, toItems, toolSummary } from './sessions.ts'
import { merapiModels, merapiPlan } from './merapi.ts'
import { MERAPI_MODEL, prepareProduk, sourceEnv, sourceList, sourceReady } from './sources.ts'
import { COMPACT_WINDOWS, type ShellTask } from '../../shared/protocol.ts'
import type {
  AiSettings, Answer, ChatItem, ContextInfo, EffortLevel, ImageAttachment, ModelOption, PendingRequest, PermissionMode, PlanInfo,
  PlanWindow, Question, ServerMessage, SessionStatus, SourceId,
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
  appCount(): number
  started(ref: string, sessionId: string): void
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

// Login ditentukan oleh sumber AI yang dipilih. API key dan variabel dari sesi Claude Code induk (kalau server
// dijalankan dari dalam Claude Code) dibuang supaya tidak mengambil alih login itu.
function childEnv(source: SourceId): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue
    if (k === 'ANTHROPIC_API_KEY' || k === 'ANTHROPIC_AUTH_TOKEN' || k === 'ANTHROPIC_BASE_URL' || k === 'CLAUDECODE' || k === 'CLAUDE_CONFIG_DIR' || k.startsWith('CLAUDE_CODE_')) continue
    env[k] = v
  }
  return { ...env, ...sourceEnv(source) }
}

// Playwright MCP yang memakai Chromium bersama (browser.ts), jadi Aan bisa menonton apa yang dikerjakan Claude
const PLAYWRIGHT_MCP = path.join(import.meta.dirname, '../node_modules/@playwright/mcp/cli.js')
function browserMcp(): Options['mcpServers'] {
  if (!BROWSER_ENABLED || !fs.existsSync(PLAYWRIGHT_MCP)) return undefined
  return { browser: { type: 'stdio', command: process.execPath, args: [PLAYWRIGHT_MCP, '--cdp-endpoint', `http://127.0.0.1:${BROWSER_PORT}`] } }
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
  readonly source: SourceId
  tokens = 0 // token konteks saat ini: input panggilan terakhir ditambah output yang sudah mengalir
  closing = false
  stopWhenIdle = false // sumber diganti saat sesi ini bekerja: tutup begitu gilirannya selesai
  private tokenBase = 0
  private tokensSentAt = 0
  private dirty = false // ada percakapan baru sejak compact terakhir
  private compacting = false
  private shells: ShellTask[] = []
  private compactingSince = 0
  private closeAfterCompact = false
  private closed: (() => void)[] = []

  constructor(
    hub: Hub,
    opts: {
      sessionId?: string; cwd: string; mode: PermissionMode; ref?: string; title?: string; model?: string; effort?: EffortLevel
      source: SourceId; compactWindow: number; tokens?: number
    },
  ) {
    this.hub = hub
    this.cwd = opts.cwd
    this.mode = opts.mode
    this.title = opts.title ?? ''
    this.source = opts.source
    this.tokens = opts.tokens ?? 0
    // model Merapi dan model Claude tidak saling dikenal: pilihan lama yang tidak cocok dengan sumber ini diabaikan
    const want = opts.model && opts.model !== 'default' ? opts.model : undefined
    if (this.source === 'merapi') {
      this.model = want && hub.isMerapiModel(want) ? want : MERAPI_MODEL
    } else {
      if (want && !hub.isMerapiModel(want)) this.model = want
      this.effort = opts.effort
    }
    if (opts.sessionId) this.sessionId = opts.sessionId
    this.q = query({
      prompt: this.inbox,
      options: {
        cwd: this.cwd,
        resume: opts.sessionId,
        model: this.model || undefined,
        effort: this.effort,
        pathToClaudeCodeExecutable: CLAUDE_BIN,
        env: childEnv(this.source),
        settings: { autoCompactWindow: opts.compactWindow },
        mcpServers: browserMcp(),
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
      effort: this.effort, source: this.source, shells: this.shells, compactingSince: this.compactingSince || undefined,
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

  // judul untuk daftar sesi sebelum berkas JSONL-nya ada
  get displayTitle() {
    return this.label
  }
  rename(title: string) {
    this.title = title
  }

  send(text: string, images: ImageAttachment[] = []) {
    this.lastActivity = Date.now()
    this.dirty = true
    this.closeAfterCompact = false // pesan baru membatalkan penutupan sesi setelah compact
    if (!this.title) this.lastPrompt ||= clip(text.replace(/\s+/g, ' '), 60) || 'Foto'
    const content = images.length
      ? [
          ...images.map(i => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mediaType, data: i.data } })),
          ...(text ? [{ type: 'text' as const, text }] : []),
        ]
      : text
    const uuid = crypto.randomUUID() // dipakai Claude Code sebagai uuid baris JSONL, jadi gambar bisa dicari lagi
    this.inbox.push({
      type: 'user',
      uuid,
      message: { role: 'user', content },
      parent_tool_use_id: null,
      origin: { kind: 'human' },
    } as SDKUserMessage)
    this.item({
      k: 'user', id: uuid, ts: new Date().toISOString(), text,
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
      this.shells = []
      this.compactingSince = 0
      this.setStatus('closed')
      this.hub.remove(this)
      for (const fn of this.closed.splice(0)) fn()
    }
  }

  // pesan yang datang saat proses sedang ditutup dikirim ulang lewat proses baru
  afterClose(fn: () => void) {
    this.closed.push(fn)
  }

  private setTokens(total: number) {
    this.tokens = total
    const now = Date.now()
    if (now - this.tokensSentAt < 1000) return
    this.tokensSentAt = now
    this.hub.events.toSubscribers(this.sessionId, { t: 'tokens', sessionId: this.sessionId, total })
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
      const ev = m.event as {
        type: string; delta?: { type: string; text?: string }; usage?: { output_tokens?: number }
        message?: { usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }
      }
      if (m.parent_tool_use_id === null && ev.type === 'message_start' && ev.message?.usage) {
        const u = ev.message.usage
        this.tokenBase = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
        this.setTokens(this.tokenBase)
      }
      if (m.parent_tool_use_id === null && ev.type === 'message_delta' && ev.usage?.output_tokens) this.setTokens(this.tokenBase + ev.usage.output_tokens)
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
    if (m.type === 'system' && m.subtype === 'status') {
      const since = m.status === 'compacting' ? this.compactingSince || Date.now() : 0
      if (since !== this.compactingSince) {
        this.compactingSince = since
        if (this.sessionId) this.hub.events.toAll(this.statusMessage())
      }
      return
    }
    if (m.type === 'system' && m.subtype === 'background_tasks_changed') {
      // set penuh, bukan selisih; agen dan tugas ambient tidak dihitung sebagai shell
      this.shells = m.tasks
        .filter(t => !t.ambient && (t.task_type === 'local_bash' || t.task_type === 'monitor_mcp' || t.task_type === 'monitor'))
        .map(t => ({ id: t.task_id, type: t.task_type, description: t.description }))
      if (this.sessionId) this.hub.events.toAll(this.statusMessage())
      return
    }
    if (m.type === 'system' && m.subtype === 'compact_boundary') {
      this.compactingSince = 0
      this.item({ k: 'system', id: m.uuid, ts: new Date().toISOString(), text: 'Percakapan diringkas (compact)' })
      this.dirty = false
      this.tokensSentAt = 0
      if (m.compact_metadata.post_tokens) this.setTokens(m.compact_metadata.post_tokens)
      return
    }
    if (m.type === 'result') {
      this.compactingSince = 0
      this.setStatus(this.pending.size ? 'waiting' : 'idle')
      this.tokensSentAt = 0
      if (this.tokens) this.setTokens(this.tokens)
      void this.hub.refreshPlan()
      if (this.compacting) {
        // compact otomatis: tidak perlu notifikasi "selesai"
        this.compacting = false
        this.lastText = ''
        if (this.closeAfterCompact || this.stopWhenIdle) this.stop()
        return
      }
      if (this.stopWhenIdle && !this.pending.size) this.stop()
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
    if (this.source === 'merapi') return // pilihan tersimpan untuk sumber lain; Merapi memakai satu model tetap
    await this.q.setModel(model === 'default' ? undefined : model)
    this.model = model === 'default' ? '' : model
    this.setStatus(this.status)
  }

  async setEffort(effort: EffortLevel | 'default') {
    if (this.source === 'merapi') return
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
    this.closing = true
    this.inbox.close()
    setTimeout(() => this.q.close(), 5000).unref()
  }

  // sesi berakhir (menganggur lama atau dihentikan pengguna): ringkas dulu selagi cache masih hangat, lalu tutup
  compactThenStop() {
    if (!this.dirty || this.tokens < MIN_COMPACT_TOKENS) return this.stop()
    this.compacting = true
    this.closeAfterCompact = true
    this.lastActivity = Date.now()
    this.inbox.push({
      type: 'user',
      message: { role: 'user', content: '/compact' },
      parent_tool_use_id: null,
      origin: { kind: 'human' },
    } as SDKUserMessage)
    this.setStatus('running')
  }
}

const PREFS_FILE = path.join(STATE_DIR, 'models.json')
const MODELS_FILE = path.join(STATE_DIR, 'models-list.json')
const SETTINGS_FILE = path.join(STATE_DIR, 'settings.json')
const DEFAULT_COMPACT_WINDOW = 200_000
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

interface Pref { model?: string; effort?: EffortLevel; source?: SourceId }

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
async function probePlan(source: SourceId): Promise<PlanInfo | null> {
  const inbox = new Inbox()
  const q = query({
    prompt: inbox,
    options: { cwd: DEFAULT_CWD, pathToClaudeCodeExecutable: CLAUDE_BIN, env: childEnv(source), persistSession: false },
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
  plan: PlanInfo | null = null
  private merapiList: ModelOption[] = []
  private planCache = new Map<SourceId, { plan: PlanInfo | null; at: number }>() // kuota sumber yang hanya dilihat, bukan dipakai
  private planAt = 0
  private planBusy = false
  private saved: { source: SourceId; compactWindow: number } = {
    source: 'personal', compactWindow: DEFAULT_COMPACT_WINDOW, ...readJson(SETTINGS_FILE, {}),
  }
  constructor(events: HubEvents) {
    this.events = events
    prepareProduk()
    void this.loadMerapiModels()
    setInterval(() => {
      for (const r of this.runs.values()) {
        if (r.status === 'idle' && !r.pending.size && !r.closing && Date.now() - r.lastActivity > IDLE_MS) r.compactThenStop()
      }
      if (this.events.appCount()) void this.refreshPlan()
    }, 60_000).unref()
  }

  settings(): AiSettings {
    return { ...this.saved, sources: sourceList() }
  }

  private saveSettings() {
    writeJson(SETTINGS_FILE, this.saved)
    this.events.toAll({ t: 'settings', settings: this.settings() })
  }

  // Sumber dipilih per sesi. Sesi yang berjalan memakai sumber lama sampai ditutup; pesan berikutnya membuka proses baru
  // dengan sumber baru. Tanpa sessionId yang diubah hanya sumber bawaan untuk sesi baru, sesi lain tidak ikut berpindah.
  setSource(source: SourceId, sessionId?: string): ServerMessage | null {
    const info = sourceList().find(s => s.id === source)
    if (!info) throw new Error('Sumber tidak dikenal')
    if (!info.ready) throw new Error(info.hint)
    let st: ServerMessage | null = null
    if (sessionId) {
      this.savePref(sessionId, { source })
      const r = this.runs.get(sessionId)
      if (r && r.source !== source) this.closeWhenFree(r)
      else if (!r) st = this.closedStatus(sessionId)
    }
    if (source !== this.saved.source) {
      this.saved.source = source
      this.saveSettings()
      this.plan = null
      this.planAt = 0
      this.planCache.delete(source)
      this.events.toAll({ t: 'plan', plan: null })
      if (source === 'merapi') void this.loadMerapiModels()
      void this.refreshPlan()
    }
    return st
  }

  setCompactWindow(tokens: number) {
    if (!COMPACT_WINDOWS.includes(tokens)) throw new Error('Ukuran autocompact tidak dikenal')
    if (tokens === this.saved.compactWindow) return
    this.saved.compactWindow = tokens
    this.saveSettings()
    // ukuran hanya terbaca saat proses dibuka (applyFlagSettings tidak mengubahnya), jadi proses ditutup dan dibuka lagi
    // pada pesan berikutnya. Akun dan model tetap sama, jadi cache tetap terpakai.
    for (const r of this.runs.values()) this.closeWhenFree(r)
  }

  private closeWhenFree(r: Run) {
    if (r.status === 'idle' && !r.pending.size) r.stop()
    else r.stopWhenIdle = true
  }

  // Kuota sumber aktif untuk angka x% y% di layar. Proses claude sementara mahal dibuka, jadi tanpa sesi berjalan lebih jarang.
  async refreshPlan() {
    const source = this.saved.source
    if (this.planBusy) return
    if (!sourceReady(source)) {
      if (this.plan) this.events.toAll({ t: 'plan', plan: (this.plan = null) })
      return
    }
    const run = source === 'merapi' ? undefined : [...this.runs.values()].find(r => r.source === source && !r.closing)
    if (Date.now() - this.planAt < (source === 'merapi' ? 60_000 : run ? 30_000 : 180_000)) return
    this.planBusy = true
    try {
      const plan = await withTimeout(source === 'merapi' ? merapiPlan() : run ? run.planUsage() : probePlan(source), 30_000)
      this.planAt = Date.now()
      if (source !== this.saved.source) return
      this.plan = plan
      this.events.toAll({ t: 'plan', plan })
    } catch {
      // kuota gagal dibaca: angka terakhir tetap tampil, dicoba lagi pada putaran berikutnya
    } finally {
      this.planBusy = false
    }
  }

  // Kuota sumber apa pun untuk panel penggunaan (melihat tanpa berpindah). Sumber aktif memakai angka yang sudah ada.
  async planFor(source: SourceId): Promise<PlanInfo | null> {
    if (!sourceReady(source)) return null
    if (source === this.saved.source) {
      await this.refreshPlan()
      return this.plan
    }
    const hit = this.planCache.get(source)
    if (hit && Date.now() - hit.at < 120_000) return hit.plan
    const run = source === 'merapi' ? undefined : [...this.runs.values()].find(r => r.source === source && !r.closing)
    const plan = await withTimeout(source === 'merapi' ? merapiPlan() : run ? run.planUsage() : probePlan(source), 30_000)
    this.planCache.set(source, { plan, at: Date.now() })
    return plan
  }

  isMerapiModel(value: string) {
    return value !== 'default' && this.merapiList.some(m => m.value === value)
  }

  private async loadMerapiModels() {
    try {
      const list = await merapiModels()
      if (!list.length) return
      this.merapiList = list
      this.events.toAll({ t: 'models', models: this.models() })
    } catch {
      // gateway tidak terjangkau: daftar Merapi kosong, sumber Merapi memakai model bawaannya
    }
  }

  register(r: Run) {
    this.fresh.delete(r)
    this.runs.set(r.sessionId, r)
    // sumber disematkan per sesi: mengganti sumber di sesi lain tidak boleh memindahkan sesi ini
    const keep = r.source !== 'merapi' && (r.model || r.effort)
    this.savePref(r.sessionId, { source: r.source, ...(keep ? { model: r.model || null, effort: r.effort ?? null } : {}) })
  }

  sourceOf(sessionId: string): SourceId {
    const s = this.pref(sessionId).source
    return s && sourceList().some(x => x.id === s) ? s : this.saved.source
  }

  pref(id: string): Pref {
    return this.prefs[id] ?? {}
  }

  // null menghapus pilihan (kembali ke pengaturan Claude Code)
  private savePref(id: string, patch: { model?: string | null; effort?: EffortLevel | null; source?: SourceId }) {
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
    return { t: 'status', sessionId, status: liveElsewhere().has(sessionId) ? 'terminal' : 'closed', pending: [], model: p.model, effort: p.effort, source: this.sourceOf(sessionId) }
  }

  models(): ModelOption[] {
    return [...this.modelList, ...this.merapiList]
  }

  // daftar model asli dari Claude Code, diambil sekali dari sesi pertama yang berjalan
  learnModels(r: Run) {
    if (this.modelsLearned || r.source === 'merapi') return
    this.modelsLearned = true
    r.supportedModels()
      .then(list => {
        if (!list.length) return
        this.modelList = list.map(m => ({
          value: m.value, displayName: m.displayName, description: m.description,
          supportsEffort: m.supportsEffort, efforts: m.supportedEffortLevels,
        }))
        writeJson(MODELS_FILE, this.modelList)
        this.events.toAll({ t: 'models', models: this.models() })
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
  async usage(sessionId?: string, source?: SourceId): Promise<{ context: ContextInfo | null; plan: PlanInfo | null }> {
    const r = sessionId ? this.runs.get(sessionId) : undefined
    const context = r ? await withTimeout(r.contextUsage(), 20_000).catch(() => null) : null
    const plan = await this.planFor(source ?? this.saved.source).catch(() => null)
    return { context, plan }
  }

  // Ganti nama sesi: baris custom-title ditambahkan ke JSONL, format yang sama dengan /rename di Claude Code
  rename(id: string, raw: string): string | undefined {
    const title = raw.replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!title) return undefined
    const f = findFile(id)
    if (!f) return undefined
    fs.appendFileSync(f.file, JSON.stringify({ type: 'custom-title', customTitle: title, sessionId: id }) + '\n')
    this.runs.get(id)?.rename(title)
    return title
  }

  // Sesi yang sedang bekerja atau terbuka di terminal dilewati; sesi yang hanya menganggur ditutup dulu
  async deleteSessions(ids: string[]): Promise<{ deleted: string[]; skipped: { id: string; reason: string }[] }> {
    const deleted: string[] = []
    const skipped: { id: string; reason: string }[] = []
    const live = liveElsewhere()
    for (const id of ids) {
      if (live.has(id)) {
        skipped.push({ id, reason: 'terbuka di terminal' })
        continue
      }
      const r = this.runs.get(id)
      if (r && (r.status !== 'idle' || r.pending.size)) {
        skipped.push({ id, reason: 'sedang berjalan' })
        continue
      }
      if (r) {
        await new Promise<void>(done => {
          r.afterClose(done)
          r.stop()
        })
      }
      let f = findFile(id)
      if (!f) {
        skipped.push({ id, reason: 'tidak ditemukan' })
        continue
      }
      // id yang sama bisa ada di lebih dari satu folder proyek
      for (; f; f = findFile(id)) deleteSessionFiles(f)
      this.savePref(id, { model: null, effort: null })
      deleted.push(id)
    }
    return { deleted, skipped }
  }

  // sesi berakhir atas permintaan pengguna
  end(sessionId: string) {
    const r = this.runs.get(sessionId)
    if (!r) return
    if (r.status === 'idle' && !r.pending.size) r.compactThenStop()
    else r.stop()
  }

  tokens(sessionId: string): number {
    const r = this.runs.get(sessionId)
    if (r?.tokens) return r.tokens
    const f = findFile(sessionId)
    return f ? lastContextTokens(f) : 0
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
      if (running?.closing) {
        running.afterClose(() => {
          const err = this.send(opts)
          if (err) this.events.toSubscribers(opts.sessionId!, { t: 'error', ref: opts.ref, sessionId: opts.sessionId, message: err })
        })
        return null
      }
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
      const r = new Run(this, {
        sessionId: f.id, cwd: realCwd(m.cwd), mode: DEFAULT_MODE, title: m.title, model: p.model, effort: p.effort,
        source: this.sourceOf(f.id), compactWindow: this.saved.compactWindow, tokens: lastContextTokens(f),
      })
      this.runs.set(f.id, r)
      r.send(opts.text, images)
      return null
    }
    // sesi baru dari tombol + dibuat di home (~), kecuali aplikasi menyebut folder lain
    const r = new Run(this, {
      cwd: realCwd(opts.cwd), mode: DEFAULT_MODE, ref: opts.ref, model: opts.model, effort: opts.effort,
      source: this.saved.source, compactWindow: this.saved.compactWindow,
    })
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
