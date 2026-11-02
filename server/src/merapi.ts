import type { ModelOption, PlanInfo, PlanWindow } from '../../shared/protocol.ts'
import { MERAPI_BASE, MERAPI_MODEL, merapiKey } from './sources.ts'

// Kuota dan daftar model gateway Merapi. Keduanya dibaca dengan key milik Aan; isi key tidak pernah dicatat.

interface Quota { used_usd: number; limit_usd: number; remaining_usd: number; resets_at?: string }

const usd = (n: number) => `$${+n.toFixed(2)}`

function window(label: string, q: Quota | undefined): PlanWindow | null {
  if (!q) return null
  return {
    label: `${label} · ${usd(q.used_usd)} dari ${usd(q.limit_usd)} (sisa ${usd(q.remaining_usd)})`,
    utilization: q.limit_usd > 0 ? Math.min(100, (q.used_usd / q.limit_usd) * 100) : null,
    resetsAt: q.resets_at ? new Date(q.resets_at).toISOString() : null,
  }
}

export async function merapiPlan(): Promise<PlanInfo | null> {
  const key = merapiKey()
  if (!key) return null
  const r = await fetch(`${MERAPI_BASE}/usage`, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
  if (!r.ok) throw new Error(`Merapi /usage HTTP ${r.status}`)
  const j = (await r.json()) as { daily?: Quota; weekly?: Quota }
  const daily = window('Harian', j.daily)
  const weekly = window('Mingguan', j.weekly)
  if (!daily && !weekly) return null
  return { subscription: 'Merapi', session: daily, weekly: weekly ? [weekly] : [] }
}

// model yang disarankan Merapi dan sudah terbukti memanggil tool; sisanya masuk "Versi lain"
const RECOMMENDED: Record<string, string> = {
  'gemini-3.8-flash-high': 'Rekomendasi Merapi: kuota paling lega, kuat untuk konteks panjang',
  'gemini-3.7-flash-high': 'Kuota longgar',
  'gemini-3.6-flash-high': 'Kuota longgar',
  [MERAPI_MODEL]: 'Model bawaan sumber Merapi',
}
const LIMITED = /^(deepseek|kimi|qwen|glm)/
// bukan model chat: gambar, peninjau kode, dan alias Claude yang ditolak untuk key ini
const SKIP = /image|embed|codex-auto-review|^claude-/

let cache: { at: number; list: ModelOption[] } | null = null

export async function merapiModels(): Promise<ModelOption[]> {
  if (cache && Date.now() - cache.at < 600_000) return cache.list
  const key = merapiKey()
  if (!key) return []
  const r = await fetch(`${MERAPI_BASE}/v1/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) })
  if (!r.ok) throw new Error(`Merapi /v1/models HTTP ${r.status}`)
  const ids = ((await r.json()) as { data?: { id: string }[] }).data?.map(m => m.id) ?? []
  const order = Object.keys(RECOMMENDED)
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length)
  const list: ModelOption[] = ids
    .filter(id => !SKIP.test(id))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((id): ModelOption => ({
      value: id,
      displayName: id,
      description: RECOMMENDED[id] ?? (LIMITED.test(id) ? 'Kuota terbatas bulan ini; pakai bila memang perlu' : 'Belum diuji untuk tool call'),
      supportsEffort: false,
      source: 'merapi',
      more: !(id in RECOMMENDED),
    }))
  list.unshift({ value: 'default', displayName: 'Default', description: `Model bawaan sumber Merapi (${MERAPI_MODEL})`, supportsEffort: false, source: 'merapi' })
  cache = { at: Date.now(), list }
  return list
}
