import { Slot } from 'expo-router'
import { useEffect } from 'react'
import { client } from '../lib/client'
import Shell from '../web/Shell'

// Layout khusus desktop (browser). Aplikasi Android memakai _layout.tsx.
export default function RootLayout() {
  useEffect(() => {
    void client.init()
  }, [])
  return (
    <Shell>
      <Slot />
    </Shell>
  )
}
