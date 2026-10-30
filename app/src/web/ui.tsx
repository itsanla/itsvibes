import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react'

// ---------- keadaan antarmuka desktop (disimpan di localStorage) ----------

interface UIState { sidebarOpen: boolean; sidebarWidth: number; panelOpen: boolean; settings: boolean; shortcuts: boolean }
const KEY = 'itsvibes.ui'
const defaults: UIState = { sidebarOpen: true, sidebarWidth: 300, panelOpen: false, settings: false, shortcuts: false }

function load(): UIState {
  try {
    return { ...defaults, ...JSON.parse(window.localStorage.getItem(KEY) ?? '{}'), settings: false, shortcuts: false }
  } catch {
    return defaults
  }
}

let state = load()
const listeners = new Set<() => void>()

export function setUI(patch: Partial<UIState>) {
  state = { ...state, ...patch }
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ sidebarOpen: state.sidebarOpen, sidebarWidth: state.sidebarWidth, panelOpen: state.panelOpen }))
  } catch {
    // mode privat: pengaturan tampilan tidak disimpan
  }
  for (const l of listeners) l()
}

export const getUI = () => state

export function useUI(): UIState {
  return useSyncExternalStore(
    cb => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    () => state,
  )
}

// ---------- ikon garis 24x24 ----------

const PATHS: Record<string, string[]> = {
  close: ['M6 6l12 12', 'M18 6L6 18'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  plus: ['M12 5v14', 'M5 12h14'],
  search: ['M20 20l-4.5-4.5', 'M11 17a6 6 0 1 0 0-12 6 6 0 0 0 0 12z'],
  chevronRight: ['M9 6l6 6-6 6'],
  chevronDown: ['M6 9l6 6 6-6'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  copy: ['M9 9h10v11H9z', 'M5 15V4h10'],
  send: ['M12 19V5', 'M6 11l6-6 6 6'],
  arrowDown: ['M12 5v14', 'M6 13l6 6 6-6'],
  paperclip: ['M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L14.5 7.6'],
  panel: ['M4 5h16v14H4z', 'M15 5v14'],
  sidebar: ['M4 5h16v14H4z', 'M9 5v14'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 5v6h-6'],
  bell: ['M6 16V11a6 6 0 0 1 12 0v5l2 2H4z', 'M10 21h4'],
  shield: ['M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z'],
  folder: ['M3 6h6l2 2h10v11H3z'],
  terminal: ['M4 5h16v14H4z', 'M7 10l3 2-3 2', 'M12 15h5'],
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v4h4'],
  globe: ['M3 12h18', 'M12 3c3 3.2 3 14.8 0 18', 'M12 3c-3 3.2-3 14.8 0 18', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z'],
  agent: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z'],
  tool: ['M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-3-3z'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  dots: [],
  stop: [],
}

export function I({ n, s = 18, c = 'currentColor', w = 1.8 }: { n: string; s?: number; c?: string; w?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {(PATHS[n] ?? PATHS.tool).map((d, i) => <path key={i} d={d} />)}
      {n === 'dots' ? [5, 12, 19].map(x => <circle key={x} cx={x} cy={12} r={1.6} fill={c} stroke="none" />) : null}
      {n === 'stop' ? <rect x={7} y={7} width={10} height={10} rx={2} fill={c} stroke="none" /> : null}
    </svg>
  )
}

// ---------- popover dan dialog ----------

export function useOutside(ref: { current: HTMLElement | null }, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOutside()
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [ref, onOutside, active])
}

// menu mengambang yang menempel pada pemicunya; tertutup lewat klik di luar atau Esc
export function Popover({ trigger, children, dir = 'up', right = false }: {
  trigger: (open: boolean, toggle: () => void) => ReactNode
  children: (close: () => void) => ReactNode
  dir?: 'up' | 'down'
  right?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = () => setOpen(false)
  useOutside(ref, close, open)
  return (
    <div className="iv-pop-wrap" ref={ref}>
      {trigger(open, () => setOpen(o => !o))}
      {open ? <div className={`iv-pop ${dir}${right ? ' right' : ''}`}>{children(close)}</div> : null}
    </div>
  )
}

export function Dialog({ title, onClose, children, width }: { title: string; onClose: () => void; children: ReactNode; width?: number }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <div className="iv-scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="iv-dialog" role="dialog" aria-label={title} style={width ? { maxWidth: width } : undefined}>
        <div className="iv-dialog-head">
          <h3>{title}</h3>
          <button className="iv-icon-btn" onClick={onClose} aria-label="Tutup"><I n="close" /></button>
        </div>
        <div className="iv-dialog-body">{children}</div>
      </div>
    </div>
  )
}

export function copyText(text: string) {
  void navigator.clipboard?.writeText(text)
}
