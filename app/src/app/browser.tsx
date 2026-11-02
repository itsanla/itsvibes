import { Redirect } from 'expo-router'

// layar browser hanya ada di versi web; aplikasi Android kembali ke daftar sesi
export default function Browser() {
  return <Redirect href="/" />
}
