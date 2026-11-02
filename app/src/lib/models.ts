import type { EffortLevel, ModelOption, SourceId } from '../../../shared/protocol'

// dipakai sampai server mengirim daftar model aslinya
export const FALLBACK_MODELS: ModelOption[] = [
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

export const needsCredit = (m: ModelOption) => /fable/i.test(m.value) || /kredit|usage credit/i.test(m.description)

// daftar model sesuai sumber: sumber Merapi punya daftar sendiri, sumber Claude memakai model Claude Code
export const modelsFor = (models: ModelOption[], source?: SourceId) =>
  models.filter(m => (source === 'merapi') === (m.source === 'merapi'))
