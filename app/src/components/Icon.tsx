import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { C } from '../lib/theme'

// ikon garis 24x24 yang digambar sendiri (tanpa paket ikon tambahan)
const PATHS: Record<string, string[]> = {
  close: ['M6 6l12 12', 'M18 6L6 18'],
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  chevronRight: ['M9 6l6 6-6 6'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronUp: ['M6 15l6-6 6 6'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  plus: ['M12 5v14', 'M5 12h14'],
  send: ['M12 19V5', 'M6 11l6-6 6 6'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 5v6h-6'],
  dots: [],
  terminal: ['M4 5h16v14H4z', 'M7 10l3 2-3 2', 'M12 15h5'],
  pencil: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
  globe: ['M3 12h18', 'M12 3c3 3.2 3 14.8 0 18', 'M12 3c-3 3.2-3 14.8 0 18'],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v4h4'],
  search: ['M20 20l-4.5-4.5'],
  agent: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z'],
  tool: ['M14.5 5.5a4 4 0 0 0-5 5L4 16l4 4 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-3-3z'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z'],
  image: ['M4 5h16v14H4z', 'M4 16l5-5 4 4 3-3 4 4'],
  stop: [],
  settings: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'],
}

export default function Icon({ name, size = 22, color = C.text, strokeWidth = 1.8 }: {
  name: keyof typeof PATHS | string
  size?: number
  color?: string
  strokeWidth?: number
}) {
  const common = { stroke: color, strokeWidth, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {(PATHS[name] ?? PATHS.tool).map((d, i) => <Path key={i} d={d} {...common} />)}
      {name === 'globe' ? <Circle cx={12} cy={12} r={9} {...common} /> : null}
      {name === 'search' ? <Circle cx={11} cy={11} r={6} {...common} /> : null}
      {name === 'settings' ? <Circle cx={12} cy={12} r={3} {...common} /> : null}
      {name === 'camera' ? <Circle cx={12} cy={13} r={3.2} {...common} /> : null}
      {name === 'image' ? <Circle cx={9} cy={9} r={1.4} {...common} /> : null}
      {name === 'dots' ? [6, 12, 18].map(y => <Circle key={y} cx={12} cy={y} r={1.6} fill={color} />) : null}
      {name === 'stop' ? <Rect x={7} y={7} width={10} height={10} rx={2} fill={color} /> : null}
    </Svg>
  )
}

// lingkar konteks di header: busur oranye sebanyak persentase konteks terpakai
export function ContextRing({ percent, size = 26 }: { percent: number | null; size?: number }) {
  const r = size / 2 - 3
  const circ = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, percent ?? 0))
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.panel2} strokeWidth={3} fill="none" />
      {percent !== null ? (
        <Circle
          cx={size / 2} cy={size / 2} r={r} stroke={C.accent} strokeWidth={3} fill="none" strokeLinecap="round"
          strokeDasharray={`${(circ * p) / 100} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
    </Svg>
  )
}
