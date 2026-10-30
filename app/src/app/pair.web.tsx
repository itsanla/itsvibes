import { Redirect } from 'expo-router'
import { useClient } from '../lib/client'
import Pair from '../web/Pair'

export default function PairRoute() {
  const c = useClient()
  if (c.ready && c.paired && c.conn !== 'unauthorized') return <Redirect href="/" />
  return <Pair />
}
