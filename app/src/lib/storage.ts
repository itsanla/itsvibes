import * as SecureStore from 'expo-secure-store'

// Penyimpanan token pairing. Di Android memakai Keystore lewat expo-secure-store;
// versi web ada di storage.web.ts (localStorage), karena SecureStore tidak tersedia di web.
export const storage = {
  get: (key: string): Promise<string | null> => SecureStore.getItemAsync(key),
  set: (key: string, value: string): Promise<void> => SecureStore.setItemAsync(key, value),
  remove: (key: string): Promise<void> => SecureStore.deleteItemAsync(key),
}
