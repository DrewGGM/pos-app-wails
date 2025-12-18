package com.drewcore.waiter_app.data.network

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import kotlinx.coroutines.*
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.InetAddress
import java.net.NetworkInterface
import java.util.concurrent.TimeUnit

class ServerDiscovery(private val context: Context? = null) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(300, TimeUnit.MILLISECONDS)
        .readTimeout(300, TimeUnit.MILLISECONDS)
        .build()

    private val prefs: SharedPreferences? = context?.getSharedPreferences("server_discovery", Context.MODE_PRIVATE)
    private val mdnsDiscovery: MDNSDiscovery? = context?.let { MDNSDiscovery(it) }

    companion object {
        private const val TAG = "ServerDiscovery"
        private const val WS_PORT = 8080
        private const val HEALTH_ENDPOINT = "/health"
        private const val PREF_LAST_SERVER_IP = "last_server_ip"

        // Common router IPs to check first
        private val COMMON_IPS = listOf(
            "192.168.1.1", "192.168.0.1", "192.168.1.100", "192.168.0.100",
            "192.168.1.254", "192.168.0.254", "10.0.0.1", "172.16.0.1"
        )
    }

    /**
     * Discover server with mDNS first, then fallback to parallel scanning
     * Total timeout of 15 seconds to prevent infinite loading
     */
    suspend fun discoverServer(): String? = withTimeoutOrNull(15000) {
        withContext(Dispatchers.IO) {
            try {
                val localIp = getLocalIpAddress() ?: return@withContext null
                Log.d(TAG, "Local IP: $localIp")

                // Special case for Android emulator
                if (localIp == "10.0.2.15") {
                    Log.d(TAG, "Detected Android emulator, trying host IP 10.0.2.2")
                    if (checkServerAt("10.0.2.2")) {
                        saveLastServerIp("10.0.2.2")
                        return@withContext "10.0.2.2"
                    }
                    return@withContext null
                }

                // 1. Try mDNS discovery first (fastest and most reliable)
                if (mdnsDiscovery != null) {
                    Log.d(TAG, "Trying mDNS discovery...")
                    val mdnsIp = mdnsDiscovery.discoverServer()
                    if (mdnsIp != null && checkServerAt(mdnsIp)) {
                        Log.d(TAG, "Server found via mDNS at: $mdnsIp")
                        saveLastServerIp(mdnsIp)
                        return@withContext mdnsIp
                    }
                    Log.d(TAG, "mDNS discovery did not find server, falling back to IP scanning")
                }

                // 2. Try last successful IP (fast fallback)
                val lastIp = getLastServerIp()
                if (lastIp != null) {
                    Log.d(TAG, "Trying last known server IP: $lastIp")
                    if (checkServerAt(lastIp)) {
                        Log.d(TAG, "Server found at last known IP: $lastIp")
                        return@withContext lastIp
                    }
                }

                // 2. Try common router/server IPs in the same subnet
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
                            return@withContext ip
                        }
                    }
                }

                // 3. Parallel scan of entire subnet (much faster)
                Log.d(TAG, "Starting parallel subnet scan...")
                val result = parallelScanSubnet(localIp)
                if (result != null) {
                    saveLastServerIp(result)
                }
                result
            } catch (e: Exception) {
                Log.e(TAG, "Error discovering server", e)
                null
            }
        }
    } ?: run {
        Log.d(TAG, "Server discovery timed out after 15 seconds")
        null
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
     * Uses semaphore to limit concurrent requests to 32
     * Timeout after 10 seconds to prevent infinite loading
     */
    private suspend fun parallelScanSubnet(localIp: String): String? = withTimeoutOrNull(10000) {
        coroutineScope {
            val ipParts = localIp.split(".")
            if (ipParts.size != 4) return@coroutineScope null

            val networkPrefix = "${ipParts[0]}.${ipParts[1]}.${ipParts[2]}"
            Log.d(TAG, "Parallel scanning network: $networkPrefix.* (limited to 32 concurrent, timeout: 10s)")

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
    } ?: run {
        Log.d(TAG, "Subnet scan timed out after 10 seconds")
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
}
