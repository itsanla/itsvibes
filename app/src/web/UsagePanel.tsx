import { useEffect } from 'react'
import type { PlanWindow } from '../../../shared/protocol'
import { useClient } from '../lib/client'
import AiControls from './AiControls'
import { Dialog, setUI } from './ui'

const COLORS: Record<string, string> = {
  messages: '#5b9cf5', memory_files: '#e8703a', system_tools: '#3fb27f', skills: '#e0a526', custom_agents: '#b07cf0',
  system_prompt: '#9a9a9a', mcp_tools: '#7fb3d5', mcp_instructions: '#8a8a8a', autocompact_buffer: '#5a5a5a', compact_buffer: '#5a5a5a', free_space: '#333',
}
const colorOf = (id?: string, kind?: string) => COLORS[id ?? ''] ?? (kind === 'free' ? '#333' : '#8a8a8a')
const fmt = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n))

function resetIn(iso: string | null) {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'Segera diatur ulang'
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4)
  return `Diatur ulang dalam ${h ? `${h} jam ` : ''}${m} mnt`
}

function Plan({ w }: { w: PlanWindow }) {
  const pct = w.utilization ?? 0
  return (
    <div className="iv-card">
      <div className="row"><span>{w.label}</span><span>{w.utilization === null ? '-' : `${Math.round(pct)}% terpakai`}</span></div>
      <div className="iv-meter plan"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <small>{resetIn(w.resetsAt)}</small>
    </div>
  )
}

// Overlay penggunaan: sumber AI, autocompact, isi jendela konteks, dan kuota paket (sama dengan /context dan /usage di terminal)
export default function UsagePanel({ id }: { id?: string }) {
  const c = useClient()
  const usage = id ? c.usage.get(id) : undefined
  const ctx = usage?.context
  const plan = c.plan
  const status = id ? c.runs.get(id)?.status : undefined
  const running = status === 'running' || status === 'starting' || status === 'waiting'
  useEffect(() => {
    c.requestUsage(id)
  }, [c, id])
  return (
    <Dialog title="Penggunaan" width={480} onClose={() => setUI({ panelOpen: false })}>
      <AiControls />
      <div className="iv-qhead" style={{ margin: '16px 0 6px' }}>Jendela konteks</div>
      {ctx ? (
        <div className="iv-card">
          <div className="row"><span>{Math.round(ctx.percentage)}% terpakai</span><span>{fmt(ctx.total)} dari {fmt(ctx.max)}</span></div>
          <div className="iv-meter">
            {ctx.categories.filter(c => c.kind !== 'free' && c.kind !== 'deferred').map(c => <i key={c.id ?? c.name} style={{ width: `${(c.tokens / ctx.max) * 100}%`, background: colorOf(c.id, c.kind) }} />)}
          </div>
          <div style={{ marginTop: 12 }}>
            {ctx.categories.map(c => (
              <div className="iv-cat" key={c.id ?? c.name}>
                <i style={{ background: colorOf(c.id, c.kind) }} />
                <span className="n" title={c.name}>{c.name}</span>
                <span className="v">{fmt(c.tokens)}</span>
                <span className="p">{c.kind === 'deferred' ? '—' : `${((c.tokens / ctx.max) * 100).toFixed(1)}%`}</span>
              </div>
            ))}
          </div>
          {ctx.mcpTools ? <small>Alat MCP: {ctx.mcpTools}</small> : null}
        </div>
      ) : (
        <div className="iv-card"><small style={{ marginTop: 0 }}>{running ? 'Memuat konteks…' : id ? 'Konteks terlihat saat sesi ini sedang berjalan. Kirim pesan untuk melanjutkannya.' : 'Buka sesi yang sedang berjalan untuk melihat konteksnya.'}</small></div>
      )}
      {plan?.session ? (
        <>
          <div className="iv-qhead" style={{ margin: '16px 0 6px' }}>Penggunaan paket</div>
          <Plan w={plan.session} />
        </>
      ) : null}
      {plan?.weekly.length ? (
        <>
          <div className="iv-qhead" style={{ margin: '16px 0 6px' }}>Batas mingguan</div>
          {plan.weekly.map(w => <Plan key={w.label} w={w} />)}
        </>
      ) : null}
    </Dialog>
  )
}
