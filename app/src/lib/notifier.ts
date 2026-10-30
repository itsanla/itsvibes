import Native, { type ItsvibesNotifier } from '../../modules/itsvibes-notifier'

export type { ItsvibesNotifier, NotifierStatus } from '../../modules/itsvibes-notifier'

// Android: service native (foreground service + OkHttp). Web: src/lib/notifier.web.ts (Notification API).
const Notifier: ItsvibesNotifier | null = Native
export default Notifier
