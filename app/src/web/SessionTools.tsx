import { useClient } from '../lib/client'
import { MODES, liveLine } from '../lib/format'
import { Ring } from './UsagePanel'
import { I, Popover, copyText, setUI } from './ui'

// Kendali sesi di sidebar, di bawah pencarian: mode izin, angka penggunaan, dan menu lainnya
export default function SessionTools({ id }: { id?: string }) {
  const c = useClient()
  const run = id ? c.runs.get(id) : undefined
  const mode = MODES.find(m => m.mode === run?.mode)
  const active = !!run && run.status !== 'closed'
  const context = id ? c.usage.get(id)?.context : null
  return (
    <div className="iv-side-tools">
      {id ? (
        <Popover
          dir="down"
          trigger={(_, toggle) => (
            <button className="iv-chip" onClick={toggle} title="Mode izin"><span>{mode?.label ?? 'Mode izin'}</span><I n="chevronDown" s={14} /></button>
          )}
        >
          {close => (
            <>
              <div className="iv-pop-title">Mode izin</div>
              {active ? MODES.map(m => (
                <button key={m.mode} className="iv-pop-item" onClick={() => { c.setMode(id, m.mode); close() }}>
                  <span><span className="n">{m.label}</span><small>{m.hint}</small></span>
                  {run?.mode === m.mode ? <span className="ck"><I n="check" s={18} w={2.2} /></span> : null}
                </button>
              )) : <div style={{ padding: '6px 10px 8px', color: 'var(--dim)', fontSize: 13 }}>Mode bisa diubah setelah sesi berjalan. Kirim pesan untuk melanjutkannya.</div>}
            </>
          )}
        </Popover>
      ) : null}
      <button className="iv-chip grow" onClick={() => setUI({ panelOpen: true })} title="Kuota 5 jam, kuota mingguan, token konteks (Ctrl+\)">
        <Ring percent={context?.percentage ?? null} />
        <span>{liveLine(c.plan, id ? c.tokens.get(id) : undefined) || 'Penggunaan'}</span>
      </button>
      {id ? (
        <Popover
          dir="down"
          trigger={(_, toggle) => <button className="iv-icon-btn" onClick={toggle} title="Lainnya"><I n="dots" /></button>}
        >
          {close => (
            <>
              {active ? <button className="iv-pop-item" onClick={() => { c.stop(id); close() }} style={{ color: 'var(--err)' }}><span className="n">Hentikan proses sesi ini</span></button> : null}
              <button className="iv-pop-item" onClick={() => { copyText(`claude --resume ${id}`); c.showToast('Perintah resume disalin'); close() }}><span><span className="n">Salin perintah claude --resume</span></span></button>
              <button className="iv-pop-item" onClick={() => { copyText(id); c.showToast('ID sesi disalin'); close() }}><span><span className="n">Salin ID sesi</span><small>{id}</small></span></button>
              <button className="iv-pop-item" onClick={() => { void c.loadHistory(id); close() }}><span><span className="n">Muat ulang riwayat</span></span></button>
            </>
          )}
        </Popover>
      ) : null}
    </div>
  )
}
