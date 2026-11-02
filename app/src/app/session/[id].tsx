import * as Clipboard from 'expo-clipboard'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, BackHandler, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ChatItem } from '../../../../shared/protocol'
import { AttachSheet, useAttachments } from '../../components/Attachments'
import ChatRow from '../../components/ChatRow'
import { FileViewerProvider } from '../../components/FileViewer'
import SessionBadges, { CompactBar } from '../../components/SessionBadges'
import Composer from '../../components/Composer'
import Icon, { ContextRing } from '../../components/Icon'
import Markdown from '../../components/Markdown'
import ModelSheet, { modelLabel } from '../../components/ModelSheet'
import RequestCard from '../../components/RequestCard'
import Sheet, { Group, Row, SectionLabel } from '../../components/Sheet'
import ToolGroup from '../../components/ToolGroup'
import UsageSheet from '../../components/UsageSheet'
import { useClient } from '../../lib/client'
import { COLUMN, useWide } from '../../lib/layout'
import { MODES, STATUS, liveLine } from '../../lib/format'
import { modelsFor } from '../../lib/models'
import { browserActive } from '../../lib/tools'
import { C } from '../../lib/theme'

type Tool = Extract<ChatItem, { k: 'tool' }>
type ToolResult = Extract<ChatItem, { k: 'tool_result' }>
type Node = { kind: 'tools'; tools: Tool[] } | { kind: 'item'; item: ChatItem }
const EMPTY: ChatItem[] = []

// Baris 'tool' berurutan dikelompokkan jadi satu ringkasan ("3 perintah dijalankan") yang membuka
// linimasa di bottom sheet saat diketuk, seperti aplikasi Claude. 'tool_result' tidak dirender
// langsung, hasilnya ditempel ke langkah tool-nya lewat peta `results`.
function groupItems(items: ChatItem[]): Node[] {
  const nodes: Node[] = []
  for (const it of items) {
    if (it.k === 'tool_result') continue
    if (it.k === 'tool') {
      const last = nodes[nodes.length - 1]
      if (last?.kind === 'tools') last.tools.push(it)
      else nodes.push({ kind: 'tools', tools: [it] })
    } else {
      nodes.push({ kind: 'item', item: it })
    }
  }
  return nodes
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const c = useClient()
  const insets = useSafeAreaInsets()
  const wide = useWide()
  const [text, setText] = useState('')
  const [menu, setMenu] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [usageOpen, setUsageOpen] = useState(false)
  const [switchTo, setSwitchTo] = useState<string | null>(null) // model yang menunggu konfirmasi ganti saat Claude bekerja
  const att = useAttachments()
  // dibuka dari notifikasi atau tautan: tidak ada layar sebelumnya, jadi kembali ke daftar sesi, bukan keluar aplikasi
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }, [])
  useFocusEffect(
    useCallback(() => {
      if (wide) return
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goBack()
        return true
      })
      return () => sub.remove()
    }, [wide, goBack]),
  )

  useEffect(() => {
    if (!id) return
    c.openChat(id)
    return () => c.closeChat(id)
  }, [c, id])

  const chat = c.chats.get(id)
  const run = c.runs.get(id)
  const summary = c.sessions.find(x => x.id === id)
  const status = run?.status ?? summary?.status ?? 'closed'
  const items = chat?.items ?? EMPTY
  const usage = c.usage.get(id)

  const { nodes, results } = useMemo(() => {
    const results = new Map<string, ToolResult>()
    for (const i of items) if (i.k === 'tool_result') results.set(i.toolUseId, i)
    return { nodes: groupItems(items).reverse(), results }
  }, [items])

  const busy = status === 'running' || status === 'starting' || status === 'waiting'
  const st = STATUS[status]

  const canSend = !!text.trim() || att.items.length > 0
  const send = () => {
    if (!canSend || !id) return
    c.send(text.trim(), { sessionId: id, images: att.items }).then(
      () => {
        setText('')
        att.clear()
      },
      e => c.showToast(e instanceof Error ? e.message : String(e)),
    )
  }
  const openMenu = () => setMenu(true)
  const openModel = () => {
    c.requestModels()
    setModelOpen(true)
  }
  const openUsage = () => {
    c.requestUsage(id)
    setUsageOpen(true)
  }

  return (
    <FileViewerProvider cwd={summary?.cwd}>
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        {wide ? null : (
          <Pressable onPress={goBack} hitSlop={12} style={s.back}>
            <Icon name="back" size={24} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{summary?.title ?? 'Sesi'}</Text>
          <Text style={[s.sub, { color: st.color }]} numberOfLines={1}>
            {st.label || 'Tidak berjalan'}{c.conn !== 'online' ? ' · offline' : ''}
          </Text>
        </View>
        <Pressable onPress={openUsage} hitSlop={10} style={[s.headerBtn, s.live]}>
          <Text style={s.liveText} numberOfLines={1}>{liveLine(c.plan, c.tokens.get(id))}</Text>
          <ContextRing percent={usage?.context?.percentage ?? null} />
        </Pressable>
        <Pressable onPress={openMenu} hitSlop={10} style={s.headerBtn}>
          <Icon name="dots" size={22} />
        </Pressable>
      </View>

      {status === 'terminal' ? (
        <View style={s.banner}>
          <Text style={s.bannerText}>Sesi ini sedang terbuka di terminal Bima. Tutup di sana dulu untuk melanjutkan dari HP.</Text>
        </View>
      ) : null}

      <FlatList
        inverted
        data={nodes}
        keyExtractor={n => (n.kind === 'tools' ? n.tools[0].id : n.item.id)}
        renderItem={({ item: node }) =>
          node.kind === 'tools' ? <ToolGroup tools={node.tools} results={results} running={busy} /> : <ChatRow item={node.item} sessionId={id} />
        }
        onEndReached={() => id && c.loadHistory(id, true)}
        onEndReachedThreshold={0.4}
        contentContainerStyle={wide ? COLUMN : undefined}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {chat?.streaming ? (
              <View style={s.streaming}><Markdown text={chat.streaming} /></View>
            ) : busy && !run?.pending.length ? (
              <View style={s.working}><ActivityIndicator color={C.accent} size="small" /><Text style={s.workingText}>Claude bekerja…</Text></View>
            ) : null}
            {(run?.pending ?? []).map(p => (
              <RequestCard key={p.id} req={p} onAnswer={a => c.answer(a)} />
            ))}
          </View>
        }
        ListFooterComponent={
          chat?.loading ? <ActivityIndicator style={{ margin: 16 }} color={C.accent} /> : chat?.before === null && chat.loaded ? <Text style={s.start}>Awal sesi</Text> : undefined
        }
      />

      <View style={[{ paddingBottom: insets.bottom + 8, paddingTop: 6 }, wide && COLUMN]}>
        {run?.compactingSince ? <CompactBar since={run.compactingSince} /> : null}
        <SessionBadges sessionId={id} browser={status !== 'closed' && browserActive(items)} shells={run?.shells ?? []} />
        <Composer
          value={text}
          onChangeText={setText}
          onSend={send}
          onStop={() => c.interrupt(id)}
          busy={busy}
          canSend={canSend}
          placeholder={status === 'closed' ? 'Kirim pesan untuk melanjutkan sesi ini' : 'Pesan untuk Claude'}
          modelText={modelLabel(run?.model, c.models)}
          effort={run?.effort}
          onOpenModel={openModel}
          attachItems={att.items}
          onRemoveAttach={att.remove}
          onAttach={att.ask}
          attachBusy={att.busy}
        />
      </View>

      <AttachSheet visible={att.picker} onClose={att.closePicker} onPick={att.pick} />

      <ModelSheet
        visible={modelOpen}
        onClose={() => setModelOpen(false)}
        models={modelsFor(c.models, run?.source ?? c.settings?.source)}
        model={run?.model}
        effort={run?.effort}
        onModel={v => (busy && v !== (run?.model ?? 'default') ? setSwitchTo(v) : c.setModel(id, v))}
        onEffort={v => c.setEffort(id, v)}
      />

      <UsageSheet
        visible={usageOpen}
        onClose={() => setUsageOpen(false)}
        usage={usage}
        loading={c.usageLoading}
        running={busy}
        sessionId={id}
        onRefresh={() => c.requestUsage(id, c.sourceOf(id))}
      />

      <Sheet visible={switchTo !== null} onClose={() => setSwitchTo(null)} title="Ganti model saat Claude bekerja?">
        <Text style={s.hint}>Berpindah model saat eksekusi sedang berjalan tidak disarankan: jawaban yang sedang dibuat bisa terputus dan konteks ditulis ulang ke cache.</Text>
        <Group>
          <Row first title="Tetap ganti" onPress={() => { if (switchTo) c.setModel(id, switchTo); setSwitchTo(null) }} />
          <Row last title="Batal" onPress={() => setSwitchTo(null)} />
        </Group>
      </Sheet>

      <Sheet visible={menu} onClose={() => setMenu(false)} title="Sesi">
        <SectionLabel>Mode izin</SectionLabel>
        {run && run.status !== 'closed' ? (
          <Group>
            {MODES.map((m, i) => (
              <Row
                key={m.mode} title={m.label} subtitle={m.hint} selected={run.mode === m.mode}
                first={i === 0} last={i === MODES.length - 1}
                onPress={() => { c.setMode(id, m.mode); setMenu(false) }}
              />
            ))}
          </Group>
        ) : (
          <Text style={s.hint}>Mode bisa diubah setelah sesi berjalan. Sesi yang dilanjutkan mulai dengan mode terakhir.</Text>
        )}
        <Group>
          {run && run.status !== 'closed' ? (
            <Row first title={<Text style={s.danger}>Hentikan proses sesi ini</Text>} onPress={() => { c.stop(id); setMenu(false) }} />
          ) : null}
          <Row
            first={!(run && run.status !== 'closed')} last title="Salin perintah claude --resume"
            onPress={() => { void Clipboard.setStringAsync(`claude --resume ${id}`); c.showToast('Perintah resume disalin'); setMenu(false) }}
          />
        </Group>
      </Sheet>
    </KeyboardAvoidingView>
    </FileViewerProvider>
  )
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.bg, paddingHorizontal: 14, paddingBottom: 10 },
  back: { padding: 6 },
  title: { color: C.text, fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  headerBtn: { padding: 6 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveText: { color: C.dim, fontSize: 12, fontVariant: ['tabular-nums'] },
  banner: { backgroundColor: '#1d2a3f', padding: 10 },
  bannerText: { color: C.link, fontSize: 13 },
  streaming: { paddingHorizontal: 16, paddingVertical: 4, opacity: 0.9 },
  working: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  workingText: { color: C.dim, fontSize: 13 },
  start: { color: C.faint, textAlign: 'center', fontSize: 12, margin: 14 },
  hint: { color: C.dim, fontSize: 14, marginBottom: 14, lineHeight: 19 },
  danger: { color: C.err, fontSize: 17 },
})
