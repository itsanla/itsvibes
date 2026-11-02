import { Redirect, useLocalSearchParams } from 'expo-router'
import { useClient } from '../lib/client'
import BrowserView from '../web/BrowserView'

export default function BrowserRoute() {
  const { s } = useLocalSearchParams<{ s?: string }>()
  const c = useClient()
  if (!c.ready) return null
  if (!c.paired) return <Redirect href="/pair" />
  return <BrowserView from={s} />
}
