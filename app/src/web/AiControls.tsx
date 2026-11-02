import { COMPACT_WINDOWS, type SourceId } from '../../../shared/protocol'
import { useClient } from '../lib/client'
import { windowLabel } from '../lib/format'

// Pilihan sumber AI dan ukuran autocompact, dipakai di panel penggunaan dan dialog pengaturan
// Dengan `pick`, memilih sumber hanya melihat kuotanya; sumber baru dipakai setelah tombol Terapkan.
export default function AiControls({ pick, onPick, sessionId }: { pick?: SourceId; onPick?: (id: SourceId) => void; sessionId?: string } = {}) {
  const c = useClient()
  const s = c.settings
  if (!s) return null
  const deferred = !!onPick && !!pick
  const used = c.sourceOf(sessionId) ?? s.source // sumber yang dipakai sesi ini
  const shown = deferred ? pick : s.source
  const active = s.sources.find(x => x.id === shown)
  const pending = deferred && pick !== used
  const notReady = s.sources.filter(x => !x.ready)
  return (
    <>
      <div className="iv-qhead" style={{ margin: '0 0 6px' }}>Sumber AI</div>
      <div className="iv-seg">
        {s.sources.map(x => (
          <button key={x.id} className={`${x.id === shown ? 'on' : ''}${x.ready ? '' : ' off'}`} title={x.hint} onClick={() => (deferred ? onPick(x.id) : c.setSource(x.id))}>
            {x.label}{deferred && x.id === used ? <i className="iv-seg-dot" title="Sumber yang sedang dipakai" /> : null}
          </button>
        ))}
      </div>
      <p className="iv-seg-note">{active?.hint}. Setelah ganti sumber, pesan berikutnya menulis ulang seluruh konteks ke cache.</p>
      {pending ? (
        <div className="iv-apply">
          <span>Baru melihat kuota {active?.label}. Sumber yang dipakai masih {s.sources.find(x => x.id === used)?.label}.</span>
          <button className="iv-btn primary" disabled={!active?.ready} onClick={() => c.setSource(pick, sessionId)}>Terapkan</button>
        </div>
      ) : null}
      {notReady.map(x => <p className="iv-seg-note" key={x.id}>{x.label}: {x.hint}</p>)}
      <div className="iv-qhead" style={{ margin: '16px 0 6px' }}>Autocompact</div>
      <div className="iv-seg">
        {COMPACT_WINDOWS.map(n => (
          <button key={n} className={n === s.compactWindow ? 'on' : ''} onClick={() => c.setCompactWindow(n)}>{windowLabel(n)}</button>
        ))}
      </div>
      <p className="iv-seg-note">Juga diringkas otomatis saat sesi berakhir atau menganggur 40 menit.</p>
    </>
  )
}
