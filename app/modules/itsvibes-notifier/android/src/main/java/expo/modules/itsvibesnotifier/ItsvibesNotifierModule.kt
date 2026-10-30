package expo.modules.itsvibesnotifier

import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ItsvibesNotifierModule : Module() {
  private val context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("ItsvibesNotifier")

    Function("start") { url: String, token: String ->
      NotifierService.saveConfig(context, url, token, true)
      NotifierService.start(context)
      true
    }

    Function("stop") {
      NotifierService.saveConfig(context, null, null, false)
      context.stopService(Intent(context, NotifierService::class.java))
      true
    }

    Function("status") {
      mapOf(
        "enabled" to NotifierService.isEnabled(context),
        "running" to NotifierService.running,
        "connected" to NotifierService.connected,
      )
    }

    Function("isIgnoringBatteryOptimizations") {
      context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)
    }

    // Samsung sering menidurkan aplikasi di latar belakang; dialog ini mengecualikan itsvibes
    Function("requestIgnoreBatteryOptimizations") {
      val i = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}"))
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(i)
    }
  }
}
