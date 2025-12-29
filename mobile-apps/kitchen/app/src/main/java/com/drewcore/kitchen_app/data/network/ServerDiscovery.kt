package com.drewcore.kitchen_app.data.network

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.drewcore.kitchen_app.data.preferences.KitchenPreferences
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.InetAddress
import java.net.NetworkInterface
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.TimeoutCancellationException

/**
 * Server connection result with connection mode information
 */
data class ServerConnection(
    val address: String,      // IP address or tunnel URL
    val isTunnel: Boolean,    // true if connected via tunnel
    val isSecure: Boolean     // true if using wss://
)

class ServerDiscovery(private val context: Context? = null) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(300, TimeUnit.MILLISECONDS)
        .readTimeout(300, TimeUnit.MILLISECONDS)
        .build()

    // Client with longer timeout for tunnel connections
    private val tunnelClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    private val prefs: SharedPreferences? = context?.getSharedPreferences("server_discovery", Context.MODE_PRIVATE)
    private val kitchenPrefs: KitchenPreferences? = context?.let { KitchenPreferences(it) }
    private val mdnsDiscovery: MDNSDiscovery? = context?.let { MDNSDiscovery(it) }

    companion object {
        private const val TAG = "ServerDiscovery"
        private const val WS_PORT = 8080
        private const val HEALTH_ENDPOINT = "/health"
        private const val PREF_LAST_SERVER_IP = "last_server_ip"
        private const val PREF_LAST_CONNECTION_MODE = "last_connection_mode" // "tunnel" or "local"

        // Timeouts
        private const val DISCOVERY_TIMEOUT_MS = 15000L // 15 seconds max for entire discovery
        private const val MDNS_TIMEOUT_MS = 3000L // 3 seconds for mDNS
        private const val PARALLEL_SCAN_TIMEOUT_MS = 10000L // 10 seconds for parallel scan

        // Common router IPs to check first
        private val COMMON_IPS = listOf(
            "192.168.1.1", "192.168.0.1", "192.168.1.100", "192.168.0.100",
            "192.168.1.254", "192.168.0.254", "10.0.0.1", "172.16.0.1"
        )
    }

    /**
     * Discover server with tunnel first (if enabled), then fallback to local network
     * Returns ServerConnection with connection details
     * IMPROVED: Now with global timeout to prevent infinite loading
     */
    suspend fun discoverServerWithMode(): ServerConnection? = withContext(Dispatchers.IO) {
        try {
            // Wrap entire discovery in timeout
            withTimeout(DISCOVERY_TIMEOUT_MS) {
                // 1. Try tunnel connection first (if enabled)
                val tunnelConnection = tryTunnelConnection()
                if (tunnelConnection != null) {
                    saveLastConnectionMode("tunnel")
                    return@withTimeout tunnelConnection
                }

                // 2. Try local network discovery
                val localConnection = discoverLocalServer()
                if (localConnection != null) {
                    saveLastConnectionMode("local")
                    return@withTimeout localConnection
                }

                null
            }
        } catch (e: TimeoutCancellationException) {
            Log.e(TAG, "Discovery timeout after ${DISCOVERY_TIMEOUT_MS}ms")
            null
        } catch (e: Exception) {
            Log.e(TAG, "Error discovering server", e)
            null
        }
    }

    /**
     * Legacy method for backward compatibility - returns IP only
     */
    suspend fun discoverServer(): String? = withContext(Dispatchers.IO) {
        discoverServerWithMode()?.address
    }

    /**
     * Try to connect via Cloudflare tunnel if enabled
     */
    private suspend fun tryTunnelConnection(): ServerConnection? {
        val tunnelEnabled = kitchenPrefs?.tunnelEnabled ?: false
        val tunnelUrl = kitchenPrefs?.tunnelUrl
        val useSecure = kitchenPrefs?.tunnelUseSecure ?: true

        if (!tunnelEnabled || tunnelUrl.isNullOrBlank()) {
            Log.d(TAG, "Tunnel not configured, skipping")
            return null
        }

        Log.d(TAG, "Trying tunnel connection: $tunnelUrl")

        return try {
            // Normalize URL - remove trailing slash and protocol if present
            val cleanUrl = tunnelUrl
                .trim()
                .removeSuffix("/")
                .removePrefix("https://")
                .removePrefix("http://")
                .removePrefix("wss://")
                .removePrefix("ws://")

            val healthUrl = "https://$cleanUrl$HEALTH_ENDPOINT"

            val request = Request.Builder().url(healthUrl).build()
            val response = tunnelClient.newCall(request).execute()
            val isHealthy = response.isSuccessful
            response.close()

            if (isHealthy) {
                Log.d(TAG, "Tunnel connection successful: $cleanUrl")
                ServerConnection(
                    address = cleanUrl,
                    isTunnel = true,
                    isSecure = useSecure
                )
            } else {
                Log.d(TAG, "Tunnel health check failed")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Tunnel connection failed: ${e.message}")
            null
        }
    }

    /**
     * Discover server on local network with mDNS first, then fallback to parallel scanning
     */
    private suspend fun discoverLocalServer(): ServerConnection? {
        val localIp = getLocalIpAddress() ?: return null
        Log.d(TAG, "Local IP: $localIp")

        // Special case for Android emulator
        if (localIp == "10.0.2.15") {
            Log.d(TAG, "Detected Android emulator, trying host IP 10.0.2.2")
            if (checkServerAt("10.0.2.2")) {
                saveLastServerIp("10.0.2.2")
                return ServerConnection("10.0.2.2", isTunnel = false, isSecure = false)
            }
            return null
        }

        // 1. Try mDNS discovery first (fastest and most reliable) with timeout
        if (mdnsDiscovery != null) {
            Log.d(TAG, "Trying mDNS discovery...")
            try {
                val mdnsIp = withTimeout(MDNS_TIMEOUT_MS) {
                    mdnsDiscovery.discoverServer()
                }
                if (mdnsIp != null && checkServerAt(mdnsIp)) {
                    Log.d(TAG, "Server found via mDNS at: $mdnsIp")
                    saveLastServerIp(mdnsIp)
                    return ServerConnection(mdnsIp, isTunnel = false, isSecure = false)
                }
            } catch (e: TimeoutCancellationException) {
                Log.w(TAG, "mDNS discovery timeout after ${MDNS_TIMEOUT_MS}ms")
            }
            Log.d(TAG, "mDNS discovery did not find server, falling back to IP scanning")
        }

        // 2. Try last successful IP (fast fallback)
        val lastIp = getLastServerIp()
        if (lastIp != null) {
            Log.d(TAG, "Trying last known server IP: $lastIp")
            if (checkServerAt(lastIp)) {
                Log.d(TAG, "Server found at last known IP: $lastIp")
                return ServerConnection(lastIp, isTunnel = false, isSecure = false)
            }
        }

        // 3. Try common router/server IPs in the same subnet
        val ipParts = localIp.split(".")
        if (ipParts.size == 4) {
            val networkPrefix = "${ipParts[0]}.${ipParts[1]}.${ipParts[2]}"
            val commonSubnetIps = listOf(
                "$networkPrefix.1",
                "$networkPrefix.100",
                "$networkPrefix.254"
            )

            Log.d(TAG, "Trying common IPs in subnet: $networkPrefix.*")
            for (ip in commonSubnetIps) {
                if (ip == localIp) continue
                if (checkServerAt(ip)) {
                    Log.d(TAG, "Server found at common IP: $ip")
                    saveLastServerIp(ip)
                    return ServerConnection(ip, isTunnel = false, isSecure = false)
                }
            }
        }

        // 4. Parallel scan of entire subnet (much faster) with timeout
        Log.d(TAG, "Starting parallel subnet scan...")
        try {
            val result = withTimeout(PARALLEL_SCAN_TIMEOUT_MS) {
                parallelScanSubnet(localIp)
            }
            if (result != null) {
                saveLastServerIp(result)
                return ServerConnection(result, isTunnel = false, isSecure = false)
            }
        } catch (e: TimeoutCancellationException) {
            Log.w(TAG, "Parallel scan timeout after ${PARALLEL_SCAN_TIMEOUT_MS}ms")
        }

        return null
    }

    /**
     * Check if server exists at specific IP (for manual entry)
     */
    suspend fun checkServer(ip: String): Boolean = withContext(Dispatchers.IO) {
        if (checkServerAt(ip)) {
            saveLastServerIp(ip)
            true
        } else {
            false
        }
    }

    /**
     * Parallel scan of subnet with limited parallelism to prevent network overload
     * Uses semaphore to limit concurrent requests to 32 (optimal for most networks)
     */
    private suspend fun parallelScanSubnet(localIp: String): String? = coroutineScope {
        val ipParts = localIp.split(".")
        if (ipParts.size != 4) return@coroutineScope null

        val networkPrefix = "${ipParts[0]}.${ipParts[1]}.${ipParts[2]}"
        Log.d(TAG, "Parallel scanning network: $networkPrefix.* (limited to 32 concurrent)")

        // Limit parallelism to 32 concurrent requests to prevent network overload
        val semaphore = kotlinx.coroutines.sync.Semaphore(32)

        // Create jobs for all IPs with limited parallelism
        val jobs = (1..254).map { i ->
            async {
                semaphore.acquire()
                try {
                    val ip = "$networkPrefix.$i"
                    if (ip == localIp) return@async null

                    if (checkServerAt(ip)) {
                        Log.d(TAG, "Server found at: $ip")
                        ip
                    } else {
                        null
                    }
                } finally {
                    semaphore.release()
                }
            }
        }

        // Wait for first successful result
        for (job in jobs) {
            val result = job.await()
            if (result != null) {
                // Cancel remaining jobs
                jobs.forEach { it.cancel() }
                return@coroutineScope result
            }
        }

        Log.d(TAG, "No server found on network")
        null
    }

    private fun checkServerAt(ip: String): Boolean {
        return try {
            val url = "http://$ip:$WS_PORT$HEALTH_ENDPOINT"

            val request = Request.Builder().url(url).build()
            val response = client.newCall(request).execute()
            val isHealthy = response.isSuccessful

            response.close()
            isHealthy
        } catch (e: Exception) {
            false
        }
    }

    private fun getLocalIpAddress(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val networkInterface = interfaces.nextElement()
                val addresses = networkInterface.inetAddresses

                while (addresses.hasMoreElements()) {
                    val address = addresses.nextElement()
                    if (!address.isLoopbackAddress && address is InetAddress) {
                        val ip = address.hostAddress
                        if (ip != null && ip.indexOf(':') < 0) {
                            return ip
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting local IP", e)
        }
        return null
    }

    private fun saveLastServerIp(ip: String) {
        prefs?.edit()?.putString(PREF_LAST_SERVER_IP, ip)?.apply()
        Log.d(TAG, "Saved last server IP: $ip")
    }

    private fun getLastServerIp(): String? {
        return prefs?.getString(PREF_LAST_SERVER_IP, null)
    }

    fun clearLastServerIp() {
        prefs?.edit()?.remove(PREF_LAST_SERVER_IP)?.apply()
    }

    private fun saveLastConnectionMode(mode: String) {
        prefs?.edit()?.putString(PREF_LAST_CONNECTION_MODE, mode)?.apply()
        Log.d(TAG, "Saved connection mode: $mode")
    }

    fun getLastConnectionMode(): String? {
        return prefs?.getString(PREF_LAST_CONNECTION_MODE, null)
    }

    /**
     * Check if tunnel URL is reachable
     */
    suspend fun checkTunnelUrl(url: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val cleanUrl = url
                .trim()
                .removeSuffix("/")
                .removePrefix("https://")
                .removePrefix("http://")
                .removePrefix("wss://")
                .removePrefix("ws://")

            val healthUrl = "https://$cleanUrl$HEALTH_ENDPOINT"
            val request = Request.Builder().url(healthUrl).build()
            val response = tunnelClient.newCall(request).execute()
            val isHealthy = response.isSuccessful
            response.close()
            isHealthy
        } catch (e: Exception) {
            Log.e(TAG, "Tunnel URL check failed: ${e.message}")
            false
        }
    }
}
