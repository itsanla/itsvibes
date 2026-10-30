package expo.modules.itsvibesnotifier

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Menyalakan lagi mode siaga setelah HP dinyalakan ulang atau aplikasi diperbarui
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (NotifierService.isEnabled(context)) NotifierService.start(context)
  }
}
