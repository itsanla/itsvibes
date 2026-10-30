import { Redirect } from 'expo-router'
import { useClient } from '../lib/client'
import Welcome from '../web/Welcome'

export default function Index() {
  const c = useClient()
  if (!c.ready) return null
  if (!c.paired) return <Redirect href="/pair" />
  return <Welcome />
}
