import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CONFIG_DIR } from './config.ts'
import type { SourceId, SourceInfo } from '../../shared/protocol.ts'

// Tiga sumber AI. Personal = login Claude Code bawaan di mesin ini. Produk = login kedua di folder config
// sendiri. Merapi = gateway AI perusahaan yang berbicara format Anthropic. Isi kunci tidak pernah ada di repo.

const CLAUDE_DIR = path.join(os.homedir(), '.claude')
export const PRODUK_DIR = path.join(CONFIG_DIR, 'accounts/produk')
const MERAPI_ENV = path.join(CONFIG_DIR, 'merapi.env')
const MERAPI_URL = process.env.ITSVIBES_MERAPI_URL ?? 'https://ai.merapi.javan.id'
// model Claude di gateway ditolak untuk key ini, jadi sumber Merapi memakai satu model tetap yang terbukti bisa memanggil tool
export const MERAPI_MODEL = process.env.ITSVIBES_MERAPI_MODEL ?? 'gpt-6-luna'

function merapiKey(): string {
  try {
    return /^ITSVIBES_MERAPI_KEY=(.+)$/m.exec(fs.readFileSync(MERAPI_ENV, 'utf8'))?.[1].trim() ?? ''
  } catch {
    return ''
  }
}

// Folder Produk hanya berbeda di login: riwayat sesi, memory, settings, dan skill ditautkan ke ~/.claude,
// jadi semua sesi tetap terlihat dan bisa dilanjutkan dari sumber mana pun.
export function prepareProduk() {
  fs.mkdirSync(PRODUK_DIR, { recursive: true, mode: 0o700 })
  for (const name of fs.readdirSync(CLAUDE_DIR)) {
    if (name.startsWith('.')) continue // .credentials.json dan penanda milik tiap login
    const link = path.join(PRODUK_DIR, name)
    if (!fs.existsSync(link)) fs.symlinkSync(path.join(CLAUDE_DIR, name), link)
  }
  const state = path.join(PRODUK_DIR, '.claude.json')
  if (!fs.existsSync(state)) fs.writeFileSync(state, JSON.stringify({ hasCompletedOnboarding: true }), { mode: 0o600 })
}

export function sourceReady(id: SourceId): boolean {
  if (id === 'produk') return fs.existsSync(path.join(PRODUK_DIR, '.credentials.json'))
  if (id === 'merapi') return !!merapiKey()
  return true
}

export function sourceList(): SourceInfo[] {
  return [
    {
      id: 'produk', label: 'Produk', ready: sourceReady('produk'),
      hint: sourceReady('produk') ? 'Akun Claude Code perusahaan' : `Belum login. Di Bima jalankan: CLAUDE_CONFIG_DIR=${PRODUK_DIR} claude auth login`,
    },
    { id: 'personal', label: 'Personal', ready: true, hint: 'Akun Claude Code pribadi' },
    {
      id: 'merapi', label: 'Merapi', ready: sourceReady('merapi'),
      hint: sourceReady('merapi') ? `Gateway AI perusahaan, model ${MERAPI_MODEL}, tanpa kuota 5 jam` : `Key belum ada di ${MERAPI_ENV}`,
    },
  ]
}

// variabel tambahan untuk proses claude sesuai sumber
export function sourceEnv(id: SourceId): Record<string, string> {
  if (id === 'produk') return { CLAUDE_CONFIG_DIR: PRODUK_DIR }
  if (id === 'merapi') {
    return {
      ANTHROPIC_BASE_URL: MERAPI_URL,
      ANTHROPIC_AUTH_TOKEN: merapiKey(),
      // alias model dan panggilan latar belakang harus jatuh ke model yang tersedia di gateway
      ANTHROPIC_DEFAULT_OPUS_MODEL: MERAPI_MODEL,
      ANTHROPIC_DEFAULT_SONNET_MODEL: MERAPI_MODEL,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: MERAPI_MODEL,
      CLAUDE_CODE_SUBAGENT_MODEL: MERAPI_MODEL,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    }
  }
  return {}
}
