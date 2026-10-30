package expo.modules.itsvibesnotifier

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

// Menjaga satu WebSocket ke itsvibes-server (role=notifier) tetap hidup di latar belakang dan
// menampilkan notifikasi "selesai", "butuh izin", dan "error" walau aplikasi ditutup.
class NotifierService : Service() {
  companion object {
    private const val PREFS = "itsvibes_notifier"
    private const val CH_STATUS = "itsvibes_status"
    private const val CH_EVENTS = "itsvibes_events"
    private const val STATUS_ID = 1

    @Volatile
    var running = false
      private set

    @Volatile
    var connected = false
      private set

    fun saveConfig(ctx: Context, url: String?, token: String?, enabled: Boolean) {
      val e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      if (url != null) e.putString("url", url)
      if (token != null) e.putString("token", token)
      e.putBoolean("enabled", enabled).apply()
    }

    fun isEnabled(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("enabled", false)

    fun start(ctx: Context) {
      ContextCompat.startForegroundService(ctx, Intent(ctx, NotifierService::class.java))
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private val client = OkHttpClient.Builder()
    .pingInterval(30, TimeUnit.SECONDS)
    .readTimeout(0, TimeUnit.MILLISECONDS)
    .build()
  private var ws: WebSocket? = null
  private var backoff = 2_000L
  private var stopped = false
  private var networkCallback: ConnectivityManager.NetworkCallback? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    val nm = getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(
      NotificationChannel(CH_STATUS, "Koneksi ke Bima", NotificationManager.IMPORTANCE_MIN).apply {
        description = "Notifikasi tetap selama itsvibes siaga di latar belakang"
        setShowBadge(false)
      },
    )
    nm.createNotificationChannel(
      NotificationChannel(CH_EVENTS, "Kabar sesi Claude", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Tugas selesai, Claude butuh izin atau jawaban, dan error"
      },
    )
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!isEnabled(this)) {
      stopSelf()
      return START_NOT_STICKY
    }
    startInForeground(statusNotification("Menghubungkan ke Bima…"))
    running = true
    stopped = false
    if (ws == null) connect()
    watchNetwork()
    return START_STICKY
  }

  override fun onDestroy() {
    stopped = true
    running = false
    connected = false
    handler.removeCallbacksAndMessages(null)
    ws?.close(1000, null)
    ws = null
    networkCallback?.let { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) }
    networkCallback = null
    super.onDestroy()
  }

  private fun startInForeground(n: Notification) {
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(STATUS_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING)
    } else {
      startForeground(STATUS_ID, n)
    }
  }

  private fun openAppIntent(uri: String?, code: Int): PendingIntent {
    val i = if (uri != null) {
      Intent(Intent.ACTION_VIEW, Uri.parse(uri)).setPackage(packageName)
    } else {
      packageManager.getLaunchIntentForPackage(packageName) ?: Intent()
    }
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(this, code, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun statusNotification(text: String): Notification =
    NotificationCompat.Builder(this, CH_STATUS)
      .setSmallIcon(R.drawable.itsvibes_notif)
      .setContentTitle("itsvibes siaga")
      .setContentText(text)
      .setOngoing(true)
      .setSilent(true)
      .setContentIntent(openAppIntent(null, 0))
      .build()

  private fun updateStatus(text: String) {
    if (!stopped) getSystemService(NotificationManager::class.java).notify(STATUS_ID, statusNotification(text))
  }

  private fun connect() {
    if (stopped) return
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val base = prefs.getString("url", null)
    val token = prefs.getString("token", null)
    if (base.isNullOrBlank() || token.isNullOrBlank()) {
      updateStatus("Belum dipasangkan. Buka itsvibes.")
      return
    }
    val wsUrl = base.trimEnd('/').replaceFirst(Regex("^http"), "ws") + "/ws?role=notifier"
    val req = Request.Builder().url(wsUrl).header("Authorization", "Bearer $token").build()
    ws = client.newWebSocket(req, object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) {
        handler.post {
          connected = true
          backoff = 2_000L
          updateStatus("Terhubung ke Bima")
        }
      }

      override fun onMessage(webSocket: WebSocket, text: String) {
        try {
          val m = JSONObject(text)
          if (m.optString("t") == "notify") handler.post { showEvent(m) }
        } catch (_: Exception) {
        }
      }

      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
        handler.post { lost(webSocket, "Terputus, menyambung ulang…") }
      }

      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        handler.post {
          if (response?.code == 401) {
            // token dicabut atau salah: jangan terus mencoba, minta pairing ulang lewat aplikasi
            lost(webSocket, null)
            updateStatus("Token tidak berlaku. Buka itsvibes untuk pairing ulang.")
          } else {
            lost(webSocket, "Terputus, menyambung ulang…")
          }
        }
      }
    })
  }

  private fun lost(socket: WebSocket, status: String?) {
    if (ws !== socket) return
    ws = null
    connected = false
    if (stopped || status == null) return
    updateStatus(status)
    handler.postDelayed({ if (ws == null) connect() }, backoff)
    backoff = (backoff * 2).coerceAtMost(60_000L)
  }

  // begitu jaringan kembali (pindah WiFi/data, keluar dari mode pesawat), sambungkan saat itu juga
  private fun watchNetwork() {
    if (networkCallback != null) return
    val cb = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        handler.post {
          if (!connected && !stopped) {
            backoff = 2_000L
            handler.removeCallbacksAndMessages(null)
            ws?.cancel()
            ws = null
            connect()
          }
        }
      }
    }
    getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(cb)
    networkCallback = cb
  }

  private fun showEvent(m: JSONObject) {
    val sessionId = m.optString("sessionId")
    val title = m.optString("title", "itsvibes")
    val body = m.optString("body", "")
    val n = NotificationCompat.Builder(this, CH_EVENTS)
      .setSmallIcon(R.drawable.itsvibes_notif)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setCategory(if (m.optString("kind") == "request") NotificationCompat.CATEGORY_REMINDER else NotificationCompat.CATEGORY_MESSAGE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(openAppIntent("itsvibes://session/$sessionId", sessionId.hashCode()))
      .build()
    // satu notifikasi per sesi: kabar terbaru menggantikan yang lama
    getSystemService(NotificationManager::class.java).notify(sessionId.hashCode(), n)
  }
}
