import { COMPACT_WINDOWS } from '../../../shared/protocol'
import { useClient } from '../lib/client'
import { windowLabel } from '../lib/format'

// Pilihan sumber AI dan ukuran autocompact, dipakai di panel penggunaan dan dialog pengaturan
export default function AiControls() {
  const c = useClient()
  const s = c.settings
  if (!s) return null
  const active = s.sources.find(x => x.id === s.source)
  const notReady = s.sources.filter(x => !x.ready)
  return (
    <>
      <div className="iv-qhead" style={{ margin: '0 0 6px' }}>Sumber AI</div>
      <div className="iv-seg">
        {s.sources.map(x => (
          <button key={x.id} className={`${x.id === s.source ? 'on' : ''}${x.ready ? '' : ' off'}`} title={x.hint} onClick={() => c.setSource(x.id)}>{x.label}</button>
        ))}
      </div>
      <p className="iv-seg-note">{active?.hint}. Setelah ganti sumber, pesan berikutnya menulis ulang seluruh konteks ke cache.</p>
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
