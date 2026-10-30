import { Redirect, useLocalSearchParams } from 'expo-router'
import { useClient } from '../../lib/client'
import SessionView from '../../web/Session'

export default function SessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const c = useClient()
  if (!c.ready) return null
  if (!c.paired) return <Redirect href="/pair" />
  return <SessionView key={id} id={id} />
}
