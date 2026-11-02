import { useState } from 'react'
import type { EffortLevel, ModelOption } from '../../../shared/protocol'
import { EFFORTS, FALLBACK_MODELS, effortLabel, modelLabel, needsCredit } from '../lib/models'
import { I, Popover } from './ui'

// Chip model + upaya di kolom ketik. Satu menu mengambang: daftar model, lalu pilihan Upaya (tanpa halaman kedua).
export default function ModelChip({ models, model, effort, onModel, onEffort }: {
  models: ModelOption[]
  model?: string
  effort?: EffortLevel
  onModel: (v: string) => void
  onEffort: (v: EffortLevel | 'default') => void
}) {
  const [more, setMore] = useState(false)
  const list = models.length ? models : FALLBACK_MODELS
  const main = list.filter(m => !m.more && !m.value.startsWith('claude-'))
  const versions = list.filter(m => m.more || m.value.startsWith('claude-'))
  const current = list.some(m => m.value === model) ? model : 'default'
  const chosen = list.find(m => m.value === current)
  const levels = chosen?.efforts?.length ? EFFORTS.filter(e => chosen.efforts!.includes(e.value)) : EFFORTS

  const row = (m: ModelOption, close: () => void) => (
    <button key={m.value} className="iv-pop-item" onClick={() => { onModel(m.value); close() }}>
      <span>
        <span className="n">{m.displayName}</span>
        {needsCredit(m) ? <span className="iv-pill" style={{ marginLeft: 8, padding: '1px 8px' }}>Memerlukan kredit</span> : null}
        {m.description ? <small>{m.description}</small> : null}
      </span>
      {current === m.value ? <span className="ck"><I n="check" s={18} w={2.2} /></span> : null}
    </button>
  )

  return (
    <Popover
      dir="up"
      trigger={(_, toggle) => (
        <button className="iv-chip" onClick={toggle} title="Pilih model dan upaya">
          <span>{modelLabel(model, models)}{effort ? ` · ${effortLabel(effort)}` : ''}</span>
          <I n="chevronDown" s={14} />
        </button>
      )}
    >
      {close => (
        <>
          <div className="iv-pop-title">Model</div>
          {main.map(m => row(m, close))}
          {versions.length ? (
            <>
              <button className="iv-pop-item" onClick={() => setMore(v => !v)} style={{ color: 'var(--link)' }}>
                {more ? 'Sembunyikan versi lain' : `Versi lain (${versions.length})`}
              </button>
              {more ? versions.map(m => row(m, close)) : null}
            </>
          ) : null}
          {chosen?.supportsEffort !== false ? (
            <>
              <hr />
              <div className="iv-pop-title">Upaya</div>
              <div className="iv-seg">
                <button className={!effort ? 'on' : ''} onClick={() => onEffort('default')}>Default</button>
                {levels.map(e => (
                  <button key={e.value} className={effort === e.value ? 'on' : ''} title={e.hint} onClick={() => onEffort(e.value)}>{e.label}</button>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </Popover>
  )
}
