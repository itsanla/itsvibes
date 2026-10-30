import type { PermissionMode, PlanInfo, SessionStatus } from '../../../shared/protocol'
import { C } from './theme'

export function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return 'baru saja'
  if (s < 3600) return `${Math.floor(s / 60)} mnt`
  if (s < 86400) return `${Math.floor(s / 3600)} jam`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} hari`
  const d = new Date(ms)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

export function shortPath(p: string): string {
  return p.replace(/^\/home\/(itsanla|anla)/, '~')
}

export const STATUS: Record<SessionStatus, { label: string; color: string }> = {
  closed: { label: '', color: C.faint },
  starting: { label: 'Memulai', color: C.warn },
  running: { label: 'Berjalan', color: C.accent },
  waiting: { label: 'Menunggu kamu', color: C.warn },
  idle: { label: 'Siap', color: C.ok },
  terminal: { label: 'Terbuka di terminal', color: C.link },
}

export const MODES: { mode: PermissionMode; label: string; hint: string }[] = [
  { mode: 'default', label: 'Tanya', hint: 'Setiap tool berisiko meminta izin' },
  { mode: 'acceptEdits', label: 'Edit otomatis', hint: 'Edit berkas langsung diizinkan' },
  { mode: 'plan', label: 'Rencana', hint: 'Claude menyusun rencana dulu tanpa mengubah apa pun' },
  { mode: 'auto', label: 'Auto', hint: 'Classifier yang memutuskan, bertanya bila ragu' },
  { mode: 'bypassPermissions', label: 'Bypass', hint: 'Semua tool tanpa izin. Hati-hati.' },
]

// angka ringkas di kanan atas: kuota 5 jam, kuota mingguan, token konteks ("12% 16% 265k")
export function liveLine(plan: PlanInfo | null, tokens?: number): string {
  const pct = (u?: number | null) => (u === null || u === undefined ? null : `${Math.round(u)}%`)
  const week = plan?.weekly.find(w => w.label === 'Semua model') ?? plan?.weekly[0]
  return [pct(plan?.session?.utilization), pct(week?.utilization), tokens ? `${Math.round(tokens / 1000)}k` : null].filter(Boolean).join(' ')
}

export const windowLabel = (n: number) => (n >= 1e6 ? `${n / 1e6}M` : `${n / 1000}k`)
