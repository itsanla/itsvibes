import { requireOptionalNativeModule } from 'expo'

export interface NotifierStatus { enabled: boolean; running: boolean; connected: boolean }

export interface ItsvibesNotifier {
  start(url: string, token: string): boolean
  stop(): boolean
  status(): NotifierStatus
  isIgnoringBatteryOptimizations(): boolean
  requestIgnoreBatteryOptimizations(): void
}

// null di luar build Android (misalnya saat diuji di Expo Go). Di web dipakai src/lib/notifier.web.ts.
export default requireOptionalNativeModule<ItsvibesNotifier>('ItsvibesNotifier')
