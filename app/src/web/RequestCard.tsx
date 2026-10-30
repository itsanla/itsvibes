import { useState } from 'react'
import type { Answer, PendingRequest, Question } from '../../../shared/protocol'
import Markdown, { CodeBlock } from './Markdown'

// Kartu jawaban untuk izin tool, pertanyaan pilihan (AskUserQuestion), dan persetujuan rencana
export default function RequestCard({ req, onAnswer }: { req: PendingRequest; onAnswer: (a: Answer) => void }) {
  return req.kind === 'question' ? <QuestionCard req={req} onAnswer={onAnswer} /> : <ApprovalCard req={req} onAnswer={onAnswer} />
}

function ApprovalCard({ req, onAnswer }: { req: PendingRequest; onAnswer: (a: Answer) => void }) {
  const [note, setNote] = useState('')
  const [detail, setDetail] = useState(false)
  const plan = req.kind === 'plan'
  return (
    <div className="iv-req">
      <h4>{plan ? 'Setujui rencana ini?' : `Izinkan ${req.toolName}?`}</h4>
      {plan ? (
        <div style={{ maxHeight: 360, overflowY: 'auto' }}><Markdown text={req.plan || '(rencana kosong)'} /></div>
      ) : (
        <>
          <p>{req.summary}</p>
          <button className="iv-tools-head" onClick={() => setDetail(d => !d)}>{detail ? 'Sembunyikan rincian' : 'Lihat rincian'}</button>
          {detail ? <CodeBlock lang="masukan" text={req.input} /> : null}
        </>
      )}
      <input type="text" placeholder={plan ? 'Masukan kalau ditolak (opsional)' : 'Alasan atau arahan kalau ditolak (opsional)'} value={note} onChange={e => setNote(e.target.value)} />
      <div className="iv-req-actions">
        <button className="iv-btn danger" onClick={() => onAnswer({ requestId: req.id, behavior: 'deny', message: note })}>Tolak</button>
        {req.canRemember ? (
          <button className="iv-btn" onClick={() => onAnswer({ requestId: req.id, behavior: 'allow', remember: true })}>Izinkan untuk sesi ini</button>
        ) : null}
        <button className="iv-btn ok" onClick={() => onAnswer({ requestId: req.id, behavior: 'allow' })}>{plan ? 'Setujui' : 'Izinkan'}</button>
      </div>
    </div>
  )
}

function QuestionCard({ req, onAnswer }: { req: PendingRequest; onAnswer: (a: Answer) => void }) {
  const questions = req.questions ?? []
  const [picked, setPicked] = useState<Record<number, string[]>>({})
  const [other, setOther] = useState<Record<number, string>>({})

  const toggle = (qi: number, q: Question, label: string) => {
    setPicked(p => {
      const cur = p[qi] ?? []
      return { ...p, [qi]: q.multiSelect ? (cur.includes(label) ? cur.filter(x => x !== label) : [...cur, label]) : [label] }
    })
    if (!q.multiSelect) setOther(o => ({ ...o, [qi]: '' }))
  }
  const answerOf = (qi: number) => [...(picked[qi] ?? []), ...(other[qi]?.trim() ? [other[qi].trim()] : [])].join(', ')
  const complete = questions.every((_, qi) => answerOf(qi).length > 0)

  return (
    <div className="iv-req">
      <h4>Claude bertanya</h4>
      {questions.map((q, qi) => (
        <div key={qi}>
          {q.header ? <div className="iv-qhead">{q.header}</div> : null}
          <p style={{ margin: '2px 0 4px' }}>{q.question}</p>
          {q.options.map(o => (
            <button key={o.label} className={`iv-opt${(picked[qi] ?? []).includes(o.label) ? ' on' : ''}`} onClick={() => toggle(qi, q, o.label)}>
              <b>{q.multiSelect ? ((picked[qi] ?? []).includes(o.label) ? '☑ ' : '☐ ') : ''}{o.label}</b>
              {o.description ? <small>{o.description}</small> : null}
            </button>
          ))}
          <input
            type="text"
            placeholder="Lainnya: ketik jawaban sendiri"
            value={other[qi] ?? ''}
            onChange={e => {
              setOther(o => ({ ...o, [qi]: e.target.value }))
              if (!q.multiSelect && e.target.value) setPicked(p => ({ ...p, [qi]: [] }))
            }}
          />
        </div>
      ))}
      <div className="iv-req-actions">
        <button className="iv-btn danger" onClick={() => onAnswer({ requestId: req.id, behavior: 'deny', message: 'Pengguna tidak menjawab' })}>Lewati</button>
        <button
          className="iv-btn ok"
          disabled={!complete}
          onClick={() => {
            const answers: Record<string, string> = {}
            questions.forEach((q, qi) => (answers[q.question] = answerOf(qi)))
            onAnswer({ requestId: req.id, behavior: 'allow', answers })
          }}
        >
          Kirim jawaban
        </button>
      </div>
    </div>
  )
}
