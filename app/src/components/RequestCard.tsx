import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { Answer, PendingRequest, Question } from '../../../shared/protocol'
import { C, mono } from '../lib/theme'
import Markdown from './Markdown'

// Kartu jawaban untuk izin tool, pertanyaan pilihan (AskUserQuestion), dan persetujuan rencana
export default function RequestCard({ req, onAnswer }: { req: PendingRequest; onAnswer: (a: Answer) => void }) {
  if (req.kind === 'question') return <QuestionCard req={req} onAnswer={onAnswer} />
  return <ApprovalCard req={req} onAnswer={onAnswer} />
}

function ApprovalCard({ req, onAnswer }: { req: PendingRequest; onAnswer: (a: Answer) => void }) {
  const [detail, setDetail] = useState(false)
  const [note, setNote] = useState('')
  const plan = req.kind === 'plan'
  return (
    <View style={s.card}>
      <Text style={s.title}>{plan ? 'Setujui rencana ini?' : `Izinkan ${req.toolName}?`}</Text>
      {plan ? (
        <ScrollView style={s.planBox} nestedScrollEnabled>
          <Markdown text={req.plan || '(rencana kosong)'} />
        </ScrollView>
      ) : (
        <Pressable onPress={() => setDetail(!detail)}>
          <Text style={s.summary}>{req.summary}</Text>
          {detail ? <Text selectable style={s.code}>{req.input}</Text> : <Text style={s.more}>Ketuk untuk lihat detail</Text>}
        </Pressable>
      )}
      <TextInput
        style={s.input}
        placeholder={plan ? 'Masukan kalau ditolak (opsional)' : 'Alasan atau arahan kalau ditolak (opsional)'}
        placeholderTextColor={C.faint}
        value={note}
        onChangeText={setNote}
        multiline
      />
      <View style={s.buttons}>
        <Btn label="Tolak" color={C.err} onPress={() => onAnswer({ requestId: req.id, behavior: 'deny', message: note })} />
        {req.canRemember ? (
          <Btn label="Izinkan untuk sesi ini" color={C.link} onPress={() => onAnswer({ requestId: req.id, behavior: 'allow', remember: true })} />
        ) : null}
        <Btn label={plan ? 'Setujui' : 'Izinkan'} color={C.ok} filled onPress={() => onAnswer({ requestId: req.id, behavior: 'allow' })} />
      </View>
    </View>
  )
}

function QuestionCard({ req, onAnswer }: { req: PendingRequest; onAnswer: (a: Answer) => void }) {
  const questions = req.questions ?? []
  const [picked, setPicked] = useState<Record<number, string[]>>({})
  const [other, setOther] = useState<Record<number, string>>({})

  const toggle = (qi: number, q: Question, label: string) => {
    setPicked(p => {
      const cur = p[qi] ?? []
      const next = q.multiSelect ? (cur.includes(label) ? cur.filter(x => x !== label) : [...cur, label]) : [label]
      return { ...p, [qi]: next }
    })
    if (!q.multiSelect) setOther(o => ({ ...o, [qi]: '' }))
  }

  const answerOf = (qi: number) => {
    const custom = other[qi]?.trim()
    const labels = picked[qi] ?? []
    return [...labels, ...(custom ? [custom] : [])].join(', ')
  }
  const complete = questions.every((_, qi) => answerOf(qi).length > 0)

  const submit = () => {
    const answers: Record<string, string> = {}
    questions.forEach((q, qi) => (answers[q.question] = answerOf(qi)))
    onAnswer({ requestId: req.id, behavior: 'allow', answers })
  }

  return (
    <View style={s.card}>
      <Text style={s.title}>Claude bertanya</Text>
      {questions.map((q, qi) => (
        <View key={qi} style={{ marginTop: 8 }}>
          {q.header ? <Text style={s.header}>{q.header}</Text> : null}
          <Text style={s.question}>{q.question}</Text>
          {q.options.map(o => {
            const on = (picked[qi] ?? []).includes(o.label)
            return (
              <Pressable key={o.label} onPress={() => toggle(qi, q, o.label)} style={[s.option, on && s.optionOn]}>
                <Text style={s.optionLabel}>{q.multiSelect ? (on ? '☑ ' : '☐ ') : on ? '● ' : '○ '}{o.label}</Text>
                {o.description ? <Text style={s.optionDesc}>{o.description}</Text> : null}
              </Pressable>
            )
          })}
          <TextInput
            style={s.input}
            placeholder="Lainnya: ketik jawaban sendiri"
            placeholderTextColor={C.faint}
            value={other[qi] ?? ''}
            onChangeText={t => {
              setOther(o => ({ ...o, [qi]: t }))
              if (!q.multiSelect && t) setPicked(p => ({ ...p, [qi]: [] }))
            }}
          />
        </View>
      ))}
      <View style={s.buttons}>
        <Btn label="Lewati" color={C.err} onPress={() => onAnswer({ requestId: req.id, behavior: 'deny', message: 'Pengguna tidak menjawab' })} />
        <Btn label="Kirim jawaban" color={C.ok} filled disabled={!complete} onPress={submit} />
      </View>
    </View>
  )
}

function Btn({ label, color, onPress, filled, disabled }: { label: string; color: string; onPress: () => void; filled?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[s.btn, { borderColor: color }, filled && { backgroundColor: color }, disabled && { opacity: 0.4 }]}
    >
      <Text style={[s.btnText, { color: filled ? '#0f1115' : color }]}>{label}</Text>
    </Pressable>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: C.panel2, borderColor: C.warn, borderWidth: 1, borderRadius: 12, padding: 12, marginHorizontal: 10, marginVertical: 6 },
  title: { color: C.warn, fontWeight: '700', fontSize: 15 },
  summary: { color: C.text, marginTop: 6, fontSize: 14 },
  more: { color: C.faint, fontSize: 12, marginTop: 4 },
  code: { color: C.dim, fontFamily: mono, fontSize: 12, marginTop: 6, backgroundColor: C.code, padding: 8, borderRadius: 6 },
  planBox: { maxHeight: 320, marginTop: 8, borderColor: C.border, borderWidth: 1, borderRadius: 8, padding: 8 },
  header: { color: C.accent, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  question: { color: C.text, fontSize: 15, marginTop: 2, marginBottom: 6 },
  option: { borderColor: C.border, borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 6 },
  optionOn: { borderColor: C.accent, backgroundColor: '#2a1f1b' },
  optionLabel: { color: C.text, fontSize: 14, fontWeight: '600' },
  optionDesc: { color: C.dim, fontSize: 13, marginTop: 2 },
  input: { color: C.text, borderColor: C.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginTop: 8, fontSize: 14 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
  btn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  btnText: { fontWeight: '700', fontSize: 14 },
})
