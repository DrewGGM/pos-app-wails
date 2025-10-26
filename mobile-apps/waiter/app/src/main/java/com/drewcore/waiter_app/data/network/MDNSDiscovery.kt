package com.drewcore.waiter_app.data.network

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.util.Log
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import kotlin.coroutines.resume

/**
 * MDNSDiscovery uses Android's NsdManager to discover POS servers via mDNS
 */
class MDNSDiscovery(private val context: Context) {
    private val nsdManager: NsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val wifiManager: WifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

    companion object {
        private const val TAG = "MDNSDiscovery"
        private const val SERVICE_TYPE = "_posserver._tcp"
        private const val DISCOVERY_TIMEOUT = 5000L // 5 seconds
    }

    /**
     * Discover POS server via mDNS
     * Returns IP address if found, null otherwise
     */
    suspend fun discoverServer(): String? {
        // Acquire multicast lock for mDNS
        val multicastLock = wifiManager.createMulticastLock("posapp_mdns")
        multicastLock.setReferenceCounted(true)

        return try {
            multicastLock.acquire()
            Log.d(TAG, "Multicast lock acquired")

            withTimeout(DISCOVERY_TIMEOUT) {
                suspendCancellableCoroutine { continuation ->
                    val discoveryListener = object : NsdManager.DiscoveryListener {
                        private var resolved = false

                        override fun onDiscoveryStarted(serviceType: String?) {
                            Log.d(TAG, "mDNS discovery started for $serviceType")
                        }

                        override fun onServiceFound(serviceInfo: NsdServiceInfo?) {
                            if (serviceInfo == null) return
                            Log.d(TAG, "mDNS service found: ${serviceInfo.serviceName}")

                            // Found the service, now resolve it to get IP
                            if (serviceInfo.serviceType.contains(SERVICE_TYPE) && !resolved) {
                                resolved = true
                                resolveService(serviceInfo) { ip ->
                                    if (ip != null && continuation.isActive) {
                                        nsdManager.stopServiceDiscovery(this)
                                        continuation.resume(ip)
                                    }
                                }
                            }
                        }

                        override fun onServiceLost(serviceInfo: NsdServiceInfo?) {
                            Log.d(TAG, "mDNS service lost: ${serviceInfo?.serviceName}")
                        }

                        override fun onDiscoveryStopped(serviceType: String?) {
                            Log.d(TAG, "mDNS discovery stopped for $serviceType")
                        }

                        override fun onStartDiscoveryFailed(serviceType: String?, errorCode: Int) {
                            Log.e(TAG, "mDNS start discovery failed for $serviceType, error: $errorCode")
                            if (continuation.isActive) {
                                continuation.resume(null)
                            }
                        }

                        override fun onStopDiscoveryFailed(serviceType: String?, errorCode: Int) {
                            Log.e(TAG, "mDNS stop discovery failed for $serviceType, error: $errorCode")
                        }
                    }

                    // Start discovery
                    nsdManager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discoveryListener)

                    // Handle cancellation
                    continuation.invokeOnCancellation {
                        try {
                            nsdManager.stopServiceDiscovery(discoveryListener)
                        } catch (e: Exception) {
                            Log.w(TAG, "Error stopping discovery: ${e.message}")
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "mDNS discovery error", e)
            null
        } finally {
            // Always release the multicast lock
            if (multicastLock.isHeld) {
                multicastLock.release()
                Log.d(TAG, "Multicast lock released")
            }
        }
    }

    /**
     * Resolve service to get IP address and port
     */
    private fun resolveService(serviceInfo: NsdServiceInfo, callback: (String?) -> Unit) {
        val resolveListener = object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo?, errorCode: Int) {
                Log.e(TAG, "mDNS resolve failed for ${serviceInfo?.serviceName}, error: $errorCode")
                callback(null)
            }

            override fun onServiceResolved(serviceInfo: NsdServiceInfo?) {
                if (serviceInfo == null) {
                    callback(null)
                    return
                }

                val ip = serviceInfo.host?.hostAddress
                val port = serviceInfo.port

                Log.d(TAG, "mDNS service resolved: ${serviceInfo.serviceName} at $ip:$port")
                callback(ip)
            }
        }

        nsdManager.resolveService(serviceInfo, resolveListener)
    }
}
