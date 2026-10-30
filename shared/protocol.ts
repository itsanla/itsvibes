// Kontrak pesan antara itsvibes-server (Bima) dan aplikasi itsvibes (Android).
// Hanya berisi tipe, jadi bisa diimpor oleh server (Node) maupun aplikasi (Metro).

export const PROTOCOL_VERSION = 1

export type SessionStatus = 'closed' | 'starting' | 'running' | 'waiting' | 'idle' | 'terminal'
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'

export interface SessionSummary {
  id: string
  title: string
  cwd: string
  project: string // nama folder di ~/.claude/projects
  mtime: number // ms
  size: number
  status: SessionStatus
  mode?: PermissionMode
  automated: boolean // sesi claude -p / Agent SDK yang bukan dibuat dari itsvibes (Hermes dan sejenisnya)
  pending: number // jumlah permintaan izin / pertanyaan yang menunggu jawaban
}

export type ChatItem =
  | { k: 'user'; id: string; ts: string; text: string; images?: number }
  | { k: 'assistant'; id: string; ts: string; text: string }
  | { k: 'thinking'; id: string; ts: string; text: string }
  // added/removed: jumlah baris yang ditambah/dihapus oleh Edit, Write, MultiEdit
  | { k: 'tool'; id: string; ts: string; name: string; summary: string; input: string; added?: number; removed?: number }
  | { k: 'tool_result'; id: string; ts: string; toolUseId: string; text: string; isError: boolean }
  | { k: 'system'; id: string; ts: string; text: string }

export interface HistoryPage {
  items: ChatItem[]
  before: number | null // offset byte untuk halaman yang lebih lama, null kalau sudah di awal
}

export interface QuestionOption { label: string; description?: string }
export interface Question { question: string; header?: string; options: QuestionOption[]; multiSelect?: boolean }

export interface PendingRequest {
  id: string
  sessionId: string
  kind: 'permission' | 'question' | 'plan'
  toolName: string
  summary: string // ringkasan yang bisa dibaca manusia
  input: string // argumen tool (dipotong) untuk ditampilkan
  questions?: Question[]
  plan?: string
  canRemember: boolean
  createdAt: number
}

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface ModelOption {
  value: string
  displayName: string
  description: string
  supportsEffort?: boolean
  efforts?: EffortLevel[]
}

// isi jendela konteks per kategori (sama dengan /context di terminal)
export interface ContextInfo {
  model: string
  total: number
  max: number
  percentage: number
  categories: { id?: string; name: string; tokens: number; kind: 'used' | 'free' | 'buffer' | 'deferred' }[]
  mcpTools: number
}

export interface PlanWindow { label: string; utilization: number | null; resetsAt: string | null }
// kuota paket claude.ai milik akun di Bima (sama dengan /usage)
export interface PlanInfo { subscription: string | null; session: PlanWindow | null; weekly: PlanWindow[] }

// sumber AI yang dipakai sesi: akun Claude Code perusahaan, akun pribadi, atau gateway Merapi
export type SourceId = 'produk' | 'personal' | 'merapi'
export interface SourceInfo { id: SourceId; label: string; ready: boolean; hint: string }
export const COMPACT_WINDOWS = [100_000, 200_000, 500_000, 1_000_000]
export interface AiSettings { source: SourceId; compactWindow: number; sources: SourceInfo[] }

// foto dari HP, sudah diperkecil di HP (sisi terpanjang <= 1568 px), base64 tanpa awalan data:
export interface ImageAttachment { mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string }

export interface Answer {
  requestId: string
  behavior: 'allow' | 'deny'
  answers?: Record<string, string> // untuk pertanyaan: teks pertanyaan -> label pilihan (dipisah ", " kalau multi)
  remember?: boolean // izinkan alat ini untuk sisa sesi
  message?: string // alasan menolak / arahan lain
}

export type ClientMessage =
  // lastSeq: event terakhir yang sudah dimiliki; -1 = tanpa replay (riwayat diambil dari JSONL)
  | { t: 'subscribe'; sessionId: string; lastSeq?: number }
  | { t: 'unsubscribe'; sessionId: string }
  | { t: 'send'; ref: string; sessionId?: string; cwd?: string; text: string; images?: ImageAttachment[]; model?: string; effort?: EffortLevel }
  | { t: 'model'; sessionId: string; model: string } // 'default' = ikut pengaturan Claude Code
  | { t: 'effort'; sessionId: string; effort: EffortLevel | 'default' }
  | { t: 'models' }
  | { t: 'usage'; sessionId?: string }
  | { t: 'setSource'; source: SourceId }
  | { t: 'setCompactWindow'; tokens: number }
  | { t: 'answer'; answer: Answer }
  | { t: 'interrupt'; sessionId: string }
  | { t: 'mode'; sessionId: string; mode: PermissionMode }
  | { t: 'stop'; sessionId: string }
  | { t: 'focus'; sessionId: string | null; visible: boolean }
  | { t: 'ping' }

export type ServerMessage =
  | { t: 'hello'; version: string; protocol: number }
  | {
      t: 'status'; sessionId: string; status: SessionStatus; mode?: PermissionMode; pending: PendingRequest[]; seq?: number
      model?: string; effort?: EffortLevel
    }
  | { t: 'models'; models: ModelOption[] }
  | { t: 'usage'; sessionId?: string; context: ContextInfo | null; plan: PlanInfo | null }
  | { t: 'settings'; settings: AiSettings }
  | { t: 'plan'; plan: PlanInfo | null } // kuota sumber aktif, disiarkan berkala
  | { t: 'tokens'; sessionId: string; total: number } // token konteks sesi, diperbarui selama Claude menjawab
  | { t: 'event'; sessionId: string; seq: number; item: ChatItem }
  | { t: 'delta'; sessionId: string; seq: number; text: string }
  | { t: 'resync'; sessionId: string } // event terlewat terlalu banyak: ambil ulang riwayat
  | { t: 'started'; ref: string; sessionId: string }
  | { t: 'notify'; id: string; sessionId: string; title: string; body: string; kind: 'done' | 'request' | 'error' }
  | { t: 'error'; ref?: string; sessionId?: string; message: string }
  | { t: 'pong' }
