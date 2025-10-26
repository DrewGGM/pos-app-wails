package com.drewcore.waiter_app.update

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.util.Log
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

data class UpdateInfo(
    val version: String,
    val downloadUrl: String,
    val releaseNotes: String
)

class UpdateManager(private val context: Context) {
    private val tag = "UpdateManager"
    private val githubRepo = "DrewGGM/pos-app-wails" // Cambia por tu repositorio
    private val appName = "waiter-app"
    private var downloadId: Long = -1

    private val downloadCompleteReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
            if (id == downloadId) {
                installUpdate()
            }
        }
    }

    init {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(
                downloadCompleteReceiver,
                IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                Context.RECEIVER_NOT_EXPORTED
            )
        } else {
            context.registerReceiver(
                downloadCompleteReceiver,
                IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
            )
        }
    }

    suspend fun checkForUpdates(): UpdateInfo? = withContext(Dispatchers.IO) {
        try {
            val currentVersion = getCurrentVersion()
            val latestRelease = fetchLatestRelease() ?: return@withContext null

            val latestVersion = latestRelease.getString("tag_name").removePrefix("v")

            if (isNewerVersion(currentVersion, latestVersion)) {
                val assets = latestRelease.getJSONArray("assets")
                val apkAsset = findApkAsset(assets, appName)

                if (apkAsset != null) {
                    UpdateInfo(
                        version = latestVersion,
                        downloadUrl = apkAsset.getString("browser_download_url"),
                        releaseNotes = latestRelease.optString("body", "Nueva versión disponible")
                    )
                } else {
                    null
                }
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(tag, "Error checking for updates", e)
            null
        }
    }

    private fun fetchLatestRelease(): org.json.JSONObject? {
        return try {
            val url = URL("https://api.github.com/repos/$githubRepo/releases/latest")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.setRequestProperty("Accept", "application/vnd.github.v3+json")
            connection.connectTimeout = 10000
            connection.readTimeout = 10000

            val responseCode = connection.responseCode
            if (responseCode == HttpURLConnection.HTTP_OK) {
                val response = connection.inputStream.bufferedReader().use { it.readText() }
                org.json.JSONObject(response)
            } else {
                Log.e(tag, "Failed to fetch release: $responseCode")
                null
            }
        } catch (e: Exception) {
            Log.e(tag, "Error fetching latest release", e)
            null
        }
    }

    private fun findApkAsset(assets: JSONArray, appName: String): org.json.JSONObject? {
        for (i in 0 until assets.length()) {
            val asset = assets.getJSONObject(i)
            val name = asset.getString("name")
            if (name.startsWith(appName) && name.endsWith(".apk")) {
                return asset
            }
        }
        return null
    }

    private fun getCurrentVersion(): String {
        return try {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            packageInfo.versionName ?: "0.0.0"
        } catch (e: Exception) {
            "0.0.0"
        }
    }

    private fun isNewerVersion(current: String, latest: String): Boolean {
        val currentParts = current.split(".").map { it.toIntOrNull() ?: 0 }
        val latestParts = latest.split(".").map { it.toIntOrNull() ?: 0 }

        val maxLength = maxOf(currentParts.size, latestParts.size)

        for (i in 0 until maxLength) {
            val c = currentParts.getOrNull(i) ?: 0
            val l = latestParts.getOrNull(i) ?: 0

            if (l > c) return true
            if (l < c) return false
        }

        return false
    }

    fun downloadUpdate(updateInfo: UpdateInfo) {
        try {
            val fileName = "$appName-${updateInfo.version}.apk"
            val request = DownloadManager.Request(Uri.parse(updateInfo.downloadUrl))
                .setTitle("Actualizando Waiter App")
                .setDescription("Descargando versión ${updateInfo.version}")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(false)

            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            downloadId = downloadManager.enqueue(request)

            Log.d(tag, "Download started: $downloadId")
        } catch (e: Exception) {
            Log.e(tag, "Error downloading update", e)
        }
    }

    private fun installUpdate() {
        try {
            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val uri = downloadManager.getUriForDownloadedFile(downloadId)

            if (uri != null) {
                val intent = Intent(Intent.ACTION_VIEW)
                intent.setDataAndType(uri, "application/vnd.android.package-archive")
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                context.startActivity(intent)
            }
        } catch (e: Exception) {
            Log.e(tag, "Error installing update", e)
            installFromDownloads()
        }
    }

    private fun installFromDownloads() {
        try {
            val downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            val files = downloadDir.listFiles { file ->
                file.name.startsWith(appName) && file.name.endsWith(".apk")
            }

            val latestFile = files?.maxByOrNull { it.lastModified() }

            if (latestFile != null) {
                val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        latestFile
                    )
                } else {
                    Uri.fromFile(latestFile)
                }

                val intent = Intent(Intent.ACTION_VIEW)
                intent.setDataAndType(uri, "application/vnd.android.package-archive")
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                context.startActivity(intent)
            }
        } catch (e: Exception) {
            Log.e(tag, "Error installing from downloads", e)
        }
    }

    fun cleanup() {
        try {
            context.unregisterReceiver(downloadCompleteReceiver)
        } catch (e: Exception) {
            Log.e(tag, "Error unregistering receiver", e)
        }
    }
}
