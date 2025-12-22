package com.drewcore.waiter_app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.drewcore.waiter_app.MainActivity
import com.drewcore.waiter_app.R
import kotlinx.coroutines.*

/**
 * Foreground Service that keeps the app process alive in background.
 * This allows the WebSocket connection managed by ViewModel to stay active.
 * The service does NOT manage its own WebSocket - it just keeps the process running.
 */
class ConnectionService : Service() {

    private val binder = LocalBinder()
    private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    private var wakeLock: PowerManager.WakeLock? = null
    private var wakeLockRenewalJob: Job? = null
    private var currentStatus: String = "Conectado"
    private var isTunnel: Boolean = false

    companion object {
        private const val TAG = "ConnectionService"
        private const val CHANNEL_ID = "waiter_connection_channel"
        private const val NOTIFICATION_ID = 1001
        private const val WAKELOCK_TAG = "WaiterApp::ConnectionWakeLock"

        // Actions
        const val ACTION_START = "com.drewcore.waiter_app.START_CONNECTION"
        const val ACTION_STOP = "com.drewcore.waiter_app.STOP_CONNECTION"
        const val ACTION_UPDATE_STATUS = "com.drewcore.waiter_app.UPDATE_STATUS"

        // Extras
        const val EXTRA_SERVER_ADDRESS = "server_address"
        const val EXTRA_IS_TUNNEL = "is_tunnel"
        const val EXTRA_IS_SECURE = "is_secure"
        const val EXTRA_STATUS = "status"
        const val EXTRA_IS_CONNECTED = "is_connected"
    }

    inner class LocalBinder : Binder() {
        fun getService(): ConnectionService = this@ConnectionService
    }

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "Service created")
        createNotificationChannel()
    }

    override fun onBind(intent: Intent?): IBinder {
        return binder
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "onStartCommand: action=${intent?.action}")

        when (intent?.action) {
            ACTION_START -> {
                isTunnel = intent.getBooleanExtra(EXTRA_IS_TUNNEL, false)
                val tunnelInfo = if (isTunnel) " (Tunnel)" else " (Local)"
                currentStatus = "Conectado$tunnelInfo"
                startForegroundService()
            }
            ACTION_STOP -> {
                stopForegroundService()
                stopSelf()
            }
            ACTION_UPDATE_STATUS -> {
                val isConnected = intent.getBooleanExtra(EXTRA_IS_CONNECTED, true)
                val status = intent.getStringExtra(EXTRA_STATUS)
                if (status != null) {
                    currentStatus = status
                } else {
                    val tunnelInfo = if (isTunnel) " (Tunnel)" else " (Local)"
                    currentStatus = if (isConnected) "Conectado$tunnelInfo" else "Reconectando..."
                }
                updateNotification(currentStatus)
            }
        }

        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Conexion POS",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Mantiene la conexion con el servidor POS"
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundService() {
        val notification = createNotification(currentStatus)
        startForeground(NOTIFICATION_ID, notification)
        acquireWakeLock()
        startWakeLockRenewal()
        Log.d(TAG, "Foreground service started with status: $currentStatus")
    }

    private fun stopForegroundService() {
        Log.d(TAG, "Stopping foreground service")
        wakeLockRenewalJob?.cancel()
        releaseWakeLock()
    }

    private fun createNotification(status: String): Notification {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val disconnectIntent = Intent(this, ConnectionService::class.java).apply {
            action = ACTION_STOP
        }
        val disconnectPendingIntent = PendingIntent.getService(
            this, 1, disconnectIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Waiter App")
            .setContentText(status)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentIntent(pendingIntent)
            .addAction(0, "Desconectar", disconnectPendingIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun updateNotification(status: String) {
        val notification = createNotification(status)
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    /**
     * Update the notification status from outside (called by MainActivity/ViewModel)
     */
    fun updateStatus(isConnected: Boolean, isTunnelConnection: Boolean = false) {
        isTunnel = isTunnelConnection
        val tunnelInfo = if (isTunnel) " (Tunnel)" else " (Local)"
        currentStatus = if (isConnected) "Conectado$tunnelInfo" else "Reconectando..."
        updateNotification(currentStatus)
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                WAKELOCK_TAG
            ).apply {
                acquire(10 * 60 * 1000L) // 10 minutes, will be renewed
            }
            Log.d(TAG, "WakeLock acquired")
        }
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
                Log.d(TAG, "WakeLock released")
            }
        }
        wakeLock = null
    }

    private fun startWakeLockRenewal() {
        wakeLockRenewalJob?.cancel()
        wakeLockRenewalJob = serviceScope.launch {
            while (isActive) {
                delay(9 * 60 * 1000L) // Renew every 9 minutes (before 10 min expiry)
                if (wakeLock?.isHeld == true) {
                    wakeLock?.release()
                }
                acquireWakeLock()
                Log.d(TAG, "WakeLock renewed")
            }
        }
    }

    override fun onDestroy() {
        Log.d(TAG, "Service destroyed")
        stopForegroundService()
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // App was swiped away, keep service running
        Log.d(TAG, "Task removed, service continues")
        super.onTaskRemoved(rootIntent)
    }
}
