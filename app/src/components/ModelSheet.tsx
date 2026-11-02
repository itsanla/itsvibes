import { useState } from 'react'
import { Text } from 'react-native'
import type { EffortLevel, ModelOption } from '../../../shared/protocol'
import { C } from '../lib/theme'
import Icon from './Icon'
import Sheet, { Group, Row, SectionLabel } from './Sheet'

const FALLBACK: ModelOption[] = [
  { value: 'default', displayName: 'Default', description: 'Ikut pengaturan Claude Code di Bima' },
  { value: 'opus', displayName: 'Opus', description: '' },
  { value: 'sonnet', displayName: 'Sonnet', description: '' },
  { value: 'haiku', displayName: 'Haiku', description: '' },
]

export const EFFORTS: { value: EffortLevel; label: string; hint: string }[] = [
  { value: 'low', label: 'Rendah', hint: 'Paling cepat dan hemat' },
  { value: 'medium', label: 'Sedang', hint: 'Seimbang' },
  { value: 'high', label: 'Tinggi', hint: 'Berpikir lebih dalam' },
  { value: 'xhigh', label: 'Ekstra', hint: 'Untuk tugas yang rumit' },
  { value: 'max', label: 'Maks', hint: 'Paling teliti, paling lambat' },
]

export const effortLabel = (e?: EffortLevel) => EFFORTS.find(x => x.value === e)?.label

// "claude-opus-5-5" -> "Opus 5.5", "claude-haiku-4-5-20251001" -> "Haiku 4.5"
export function modelLabel(value: string | undefined, models: ModelOption[]): string {
  if (!value || value === 'default') return 'Default'
  const known = models.find(m => m.value === value)
  if (known) return known.displayName
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(value)
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? '.' + m[3] : ''}`
  return value
}

const needsCredit = (m: ModelOption) => /fable/i.test(m.value) || /kredit|usage credit/i.test(m.description)

export default function ModelSheet({ visible, onClose, models, model, effort, onModel, onEffort }: {
  visible: boolean
  onClose: () => void
  models: ModelOption[]
  model?: string
  effort?: EffortLevel
  onModel: (v: string) => void
  onEffort: (v: EffortLevel | 'default') => void
}) {
  const [page, setPage] = useState<'models' | 'effort'>('models')
  const list = models.length ? models : FALLBACK
  const main = list.filter(m => !m.more && !m.value.startsWith('claude-'))
  const versions = list.filter(m => m.more || m.value.startsWith('claude-'))
  const current = list.some(m => m.value === model) ? model : 'default'
  const chosen = list.find(m => m.value === current)
  const levels = chosen?.efforts?.length ? EFFORTS.filter(e => chosen.efforts!.includes(e.value)) : EFFORTS
  const close = () => {
    setPage('models')
    onClose()
  }

  if (page === 'effort') {
    return (
      <Sheet visible={visible} onClose={close} onBack={() => setPage('models')} title="Upaya">
        <Group>
          <Row title="Default" subtitle="Ikut pengaturan Claude Code" selected={!effort} first
            onPress={() => { onEffort('default'); setPage('models') }} />
          {levels.map((e, i) => (
            <Row key={e.value} title={e.label} subtitle={e.hint} selected={effort === e.value} last={i === levels.length - 1}
              onPress={() => { onEffort(e.value); setPage('models') }} />
          ))}
        </Group>
      </Sheet>
    )
  }

  const rows = (items: ModelOption[]) =>
    items.map((m, i) => (
      <Row
        key={m.value}
        title={m.displayName}
        subtitle={m.description || undefined}
        badge={needsCredit(m) ? 'Memerlukan kredit penggunaan' : undefined}
        selected={current === m.value}
        first={i === 0}
        last={i === items.length - 1}
        onPress={() => { onModel(m.value); close() }}
      />
    ))

  return (
    <Sheet visible={visible} onClose={close} title="Pilih model">
      <Group>{rows(main)}</Group>
      {chosen?.supportsEffort !== false ? (
        <Group>
          <Row
            first last title="Upaya" onPress={() => setPage('effort')}
            right={<Text style={{ color: C.dim, fontSize: 17 }}>{effortLabel(effort) ?? 'Default'}  <Icon name="chevronRight" size={18} color={C.dim} /></Text>}
          />
        </Group>
      ) : null}
      {versions.length ? (
        <>
          <SectionLabel>{list.some(m => m.source === 'merapi') ? 'Versi lain' : 'Model lainnya'}</SectionLabel>
          <Group>{rows(versions)}</Group>
        </>
      ) : null}
    </Sheet>
  )
}
