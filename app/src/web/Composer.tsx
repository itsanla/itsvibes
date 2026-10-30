import { type ReactNode, useLayoutEffect, useRef } from 'react'
import type { Attachment } from '../lib/images'
import ModelChip from './ModelChip'
import { I } from './ui'
import type { EffortLevel, ModelOption } from '../../../shared/protocol'

// Kolom ketik desktop: textarea yang tumbuh otomatis, lampiran gambar, chip model/upaya, kirim/hentikan.
// Enter mengirim, Shift+Enter baris baru, Esc menghentikan Claude yang sedang bekerja.
export default function Composer(p: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onStop?: () => void
  busy: boolean
  canSend: boolean
  placeholder: string
  autoFocus?: boolean
  drag?: boolean
  models: ModelOption[]
  model?: string
  effort?: EffortLevel
  onModel: (v: string) => void
  onEffort: (v: EffortLevel | 'default') => void
  attach: Attachment[]
  attachBusy: boolean
  onFiles: (files: File[]) => void
  onRemoveAttach: (uri: string) => void
  extra?: ReactNode
}) {
  const ta = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`
  }, [p.value])

  return (
    <div className={`iv-compose${p.drag ? ' drag' : ''}`}>
      {p.attach.length ? (
        <div className="iv-attach-row">
          {p.attach.map(a => (
            <div key={a.uri} className="iv-thumb">
              <img src={a.uri} alt="" />
              <button onClick={() => p.onRemoveAttach(a.uri)} aria-label="Hapus lampiran"><I n="close" s={12} w={2.4} c="#1a1a1a" /></button>
            </div>
          ))}
        </div>
      ) : null}
      <textarea
        id="iv-composer"
        ref={ta}
        rows={1}
        value={p.value}
        placeholder={p.placeholder}
        autoFocus={p.autoFocus}
        onChange={e => p.onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            if (p.canSend && !p.busy) p.onSend()
          } else if (e.key === 'Escape' && p.busy && p.onStop) {
            p.onStop()
          }
        }}
      />
      <div className="iv-compose-bar">
        <button className="iv-icon-btn" title="Lampirkan gambar" onClick={() => file.current?.click()} disabled={p.attachBusy}>
          {p.attachBusy ? <span className="iv-spin" /> : <I n="paperclip" />}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => {
            p.onFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
        <ModelChip models={p.models} model={p.model} effort={p.effort} onModel={p.onModel} onEffort={p.onEffort} />
        {p.extra}
        <div className="iv-spacer" />
        {p.busy && p.onStop ? (
          <button className="iv-send stop" onClick={p.onStop} title="Hentikan (Esc)"><I n="stop" s={14} /></button>
        ) : (
          <button className="iv-send" onClick={p.onSend} disabled={!p.canSend} title="Kirim (Enter)"><I n="send" s={18} w={2.4} /></button>
        )}
      </div>
    </div>
  )
}
