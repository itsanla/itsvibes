import { Redirect } from 'expo-router'

// di desktop, layar awal sudah berupa "sesi baru"
export default function New() {
  return <Redirect href="/" />
}
