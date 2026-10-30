import { type ReactNode, useEffect, useState } from 'react'
import { Animated, Dimensions, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { C } from '../lib/theme'
import Icon from './Icon'

// react-native-web tidak punya native driver; animasinya jalan lewat JS di browser
const ND = Platform.OS !== 'web'

// Bottom sheet seperti aplikasi Claude: garis tarik, X (atau kembali) di kiri, judul di tengah.
// Ditutup dengan X, ketuk latar, tombol kembali Android, atau ditarik ke bawah dari bagian atasnya.
export default function Sheet({ visible, onClose, title, onBack, right, children, scroll = true }: {
  visible: boolean
  onClose: () => void
  title?: string
  onBack?: () => void // diisi untuk halaman kedua di dalam sheet: tombol kiri jadi panah kembali
  right?: ReactNode
  children: ReactNode
  scroll?: boolean
}) {
  const insets = useSafeAreaInsets()
  const height = Dimensions.get('window').height
  // Animated.Value harus tetap satu instance sepanjang hidup komponen tanpa memicu render ulang saat
  // isinya berubah; useState dengan initializer dipakai alih-alih useRef supaya nilainya boleh dibaca
  // langsung saat render (aturan lint react-hooks/refs melarang membaca .current saat render).
  const [y] = useState(() => new Animated.Value(height))
  const [fade] = useState(() => new Animated.Value(0))
  const [mounted, setMounted] = useState(visible)

  useEffect(() => {
    if (visible) {
      // Sheet harus langsung dipasang sebelum animasi masuk dimulai, tidak bisa ditunda ke render berikutnya.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true)
      y.setValue(height)
      Animated.parallel([
        Animated.spring(y, { toValue: 0, useNativeDriver: ND, damping: 22, stiffness: 220, mass: 0.9 }),
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: ND }),
      ]).start()
    } else if (mounted) {
      // dilepas dari DOM lewat callback start() setelah animasi keluar selesai, bukan langsung di body efek
      Animated.parallel([
        Animated.timing(y, { toValue: height, duration: 200, useNativeDriver: ND }),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: ND }),
      ]).start(() => setMounted(false))
    }
    // y, fade: instance Animated.Value stabil sepanjang hidup komponen. height: diambil sekali dari
    // Dimensions, tidak reaktif. mounted: sengaja tidak diikutkan, efek ini hanya bereaksi pada `visible`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // Dibuat ulang tiap render (bukan disimpan di ref) supaya langsung menutup lewat `onClose` dan `y`
  // terbaru tanpa trik ref; PanResponder sendiri cuma kumpulan fungsi, murah untuk dibuat ulang.
  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > 120 || g.vy > 1.1) onClose()
      else Animated.spring(y, { toValue: 0, useNativeDriver: ND, damping: 22, stiffness: 220 }).start()
    },
  })

  if (!mounted) return null
  const Body = scroll ? ScrollView : View
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onBack ?? onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[s.sheet, Platform.OS === 'web' && s.sheetWeb, { maxHeight: height - insets.top - 24, transform: [{ translateY: y }, { scale: y.interpolate({ inputRange: [0, height], outputRange: [1, 0.9], extrapolate: 'clamp' }) }] }]}>
        <View {...pan.panHandlers}>
          <View style={s.handle} />
          <View style={s.header}>
            <Pressable onPress={onBack ?? onClose} hitSlop={12} style={s.side}>
              <Icon name={onBack ? 'back' : 'close'} size={26} />
            </Pressable>
            <Text style={s.title} numberOfLines={2}>{title}</Text>
            <View style={[s.side, { alignItems: 'flex-end' }]}>{right}</View>
          </View>
        </View>
        <Body
          style={{ flexGrow: 0 }}
          contentContainerStyle={scroll ? { paddingHorizontal: 16, paddingBottom: insets.bottom + 20 } : undefined}
          keyboardShouldPersistTaps="handled"
        >
          {scroll ? children : <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20 }}>{children}</View>}
        </Body>
      </Animated.View>
    </Modal>
  )
}

// kartu berisi baris-baris dengan jarak tipis, seperti daftar model di aplikasi Claude
export function Group({ children }: { children: ReactNode }) {
  return <View style={s.group}>{children}</View>
}

export function Row({ title, subtitle, onPress, selected, right, badge, first, last }: {
  title: ReactNode
  subtitle?: string
  onPress?: () => void
  selected?: boolean
  right?: ReactNode
  badge?: string
  first?: boolean
  last?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, first && s.rowFirst, last && s.rowLast, pressed && onPress && { backgroundColor: C.panel2 }]}
    >
      <View style={{ flex: 1 }}>
        <View style={s.rowTitleLine}>
          {typeof title === 'string' ? <Text style={s.rowTitle}>{title}</Text> : title}
          {badge ? <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View> : null}
        </View>
        {subtitle ? <Text style={s.rowSub}>{subtitle}</Text> : null}
      </View>
      {selected ? <Icon name="check" size={26} color={C.blue} strokeWidth={2.2} /> : right}
    </Pressable>
  )
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={s.section}>{children}</Text>
}

const s = StyleSheet.create({
  backdrop: { backgroundColor: '#000a' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.sheet, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  // browser: sheet berada di tengah dengan lebar terbatas, bukan memanjang selebar jendela
  sheetWeb: { maxWidth: 640, marginHorizontal: 'auto' },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#4a4a4a', marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14 },
  side: { width: 44 },
  title: { flex: 1, color: C.text, fontSize: 19, fontWeight: '700', textAlign: 'center' },
  group: { borderRadius: 22, overflow: 'hidden', gap: 2, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, paddingHorizontal: 18, paddingVertical: 14, gap: 12 },
  rowFirst: { borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  rowLast: { borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  rowTitle: { color: C.text, fontSize: 17 },
  rowSub: { color: C.dim, fontSize: 14, marginTop: 3, lineHeight: 19 },
  badge: { backgroundColor: C.panel2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: C.text, fontSize: 12, fontWeight: '600' },
  section: { color: C.dim, fontSize: 15, marginTop: 4, marginBottom: 8, marginLeft: 6 },
})
