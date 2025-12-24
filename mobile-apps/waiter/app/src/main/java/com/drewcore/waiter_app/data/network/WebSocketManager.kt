package com.drewcore.waiter_app.data.network

import android.util.Log
import com.drewcore.waiter_app.data.models.OrderRequest
import com.drewcore.waiter_app.data.models.WebSocketMessage
import com.google.gson.Gson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

class WebSocketManager {
    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .pingInterval(15, TimeUnit.SECONDS) // More frequent pings to detect disconnection faster
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .connectTimeout(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val gson = Gson()

    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    // Flow to emit received messages for ViewModel to handle
    private val _messages = MutableStateFlow<WebSocketMessage?>(null)
    val messages: StateFlow<WebSocketMessage?> = _messages

    // Flow to emit kitchen acknowledgment results
    private val _kitchenAckResult = MutableStateFlow<KitchenAckResult?>(null)
    val kitchenAckResult: StateFlow<KitchenAckResult?> = _kitchenAckResult

    data class KitchenAckResult(
        val orderId: Int,
        val orderNumber: String,
        val acknowledged: Boolean,
        val timestamp: Long = System.currentTimeMillis()
    )

    private var clientId: String? = null

    // Store current connection info
    private var currentConnection: ServerConnection? = null

    // Track last successful connection time for connection health monitoring
    private var lastConnectedTime: Long = 0
    private var lastMessageTime: Long = 0

    companion object {
        private const val TAG = "WebSocketManager"
        private const val WS_PORT = 8080
    }

    sealed class ConnectionState {
        object Disconnected : ConnectionState()
        object Connecting : ConnectionState()
        data class Connected(val clientId: String, val isTunnel: Boolean = false) : ConnectionState()
        data class Error(val message: String) : ConnectionState()
    }

    /**
     * Connect using ServerConnection with full tunnel/local support
     */
    fun connect(connection: ServerConnection) {
        if (_connectionState.value is ConnectionState.Connected) {
            Log.d(TAG, "Already connected")
            return
        }

        _connectionState.value = ConnectionState.Connecting
        currentConnection = connection

        val url = if (connection.isTunnel) {
            // Tunnel connection uses the full URL with secure WebSocket
            val protocol = if (connection.isSecure) "wss" else "ws"
            "$protocol://${connection.address}/ws?type=waiter"
        } else {
            // Local connection uses IP and port
            "ws://${connection.address}:$WS_PORT/ws?type=waiter"
        }

        Log.d(TAG, "Connecting to WebSocket: $url (tunnel: ${connection.isTunnel})")
        val request = Request.Builder().url(url).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket connected via ${if (connection.isTunnel) "tunnel" else "local network"}")
                lastConnectedTime = System.currentTimeMillis()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d(TAG, "Received message: $text")
                lastMessageTime = System.currentTimeMillis()
                handleMessage(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closing: $code $reason")
                _connectionState.value = ConnectionState.Disconnected
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closed: $code $reason")
                _connectionState.value = ConnectionState.Disconnected
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket error", t)
                _connectionState.value = ConnectionState.Error(t.message ?: "Unknown error")
            }
        })
    }

    /**
     * Legacy connect method for backward compatibility - uses local network only
     */
    fun connect(serverIp: String) {
        connect(ServerConnection(serverIp, isTunnel = false, isSecure = false))
    }

    private fun handleMessage(text: String) {
        try {
            val message = gson.fromJson(text, WebSocketMessage::class.java)

            when (message.type) {
                "auth_response" -> {
                    val data = message.data as? Map<*, *>
                    val success = data?.get("success") as? Boolean ?: false
                    val id = data?.get("client_id") as? String

                    if (success && id != null) {
                        clientId = id
                        val isTunnel = currentConnection?.isTunnel ?: false
                        _connectionState.value = ConnectionState.Connected(id, isTunnel)
                        Log.d(TAG, "Authenticated with client ID: $id (tunnel: $isTunnel)")
                    }
                }

                "heartbeat" -> {
                    Log.d(TAG, "Heartbeat received")
                }

                "order_new" -> {
                    Log.d(TAG, "New order received")
                    _messages.value = message
                }

                "order_update" -> {
                    Log.d(TAG, "Order update received")
                    _messages.value = message
                }

                "order_ready" -> {
                    Log.d(TAG, "Order ready notification received")
                    _messages.value = message
                }

                "order_cancelled" -> {
                    Log.d(TAG, "Order cancelled notification received")
                    _messages.value = message
                }

                "table_update" -> {
                    Log.d(TAG, "Table update received")
                    _messages.value = message
                }

                "kitchen_order" -> {
                    Log.d(TAG, "Kitchen order notification received")
                    _messages.value = message
                }

                "notification" -> {
                    Log.d(TAG, "General notification received")
                    _messages.value = message
                }

                "kitchen_ack_result" -> {
                    Log.d(TAG, "Kitchen acknowledgment result received")
                    val data = message.data as? Map<*, *>
                    val orderId = (data?.get("order_id") as? Number)?.toInt() ?: 0
                    val orderNumber = data?.get("order_number") as? String ?: ""
                    val acknowledged = data?.get("acknowledged") as? Boolean ?: false

                    _kitchenAckResult.value = KitchenAckResult(
                        orderId = orderId,
                        orderNumber = orderNumber,
                        acknowledged = acknowledged
                    )
                    Log.d(TAG, "Kitchen acknowledged order: $orderNumber (ID: $orderId)")
                }

                else -> {
                    Log.d(TAG, "Unknown message type: ${message.type}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling message", e)
        }
    }

    fun sendNewOrder(order: OrderRequest) {
        val message = mapOf(
            "type" to "order_new",
            "timestamp" to System.currentTimeMillis().toString(),
            "data" to order
        )

        val json = gson.toJson(message)
        webSocket?.send(json)
        Log.d(TAG, "Sent new order: ${order.orderNumber}")
    }

    fun disconnect() {
        webSocket?.close(1000, "Client disconnecting")
        webSocket = null
        _connectionState.value = ConnectionState.Disconnected
        clientId = null
        currentConnection = null
    }

    fun isConnected(): Boolean {
        return _connectionState.value is ConnectionState.Connected
    }

    fun getCurrentConnection(): ServerConnection? {
        return currentConnection
    }

    fun isConnectedViaTunnel(): Boolean {
        return currentConnection?.isTunnel == true && isConnected()
    }

    /**
     * Get connection uptime in milliseconds
     */
    fun getConnectionUptime(): Long {
        return if (isConnected() && lastConnectedTime > 0) {
            System.currentTimeMillis() - lastConnectedTime
        } else {
            0
        }
    }

    /**
     * Get time since last message in milliseconds
     */
    fun getTimeSinceLastMessage(): Long {
        return if (lastMessageTime > 0) {
            System.currentTimeMillis() - lastMessageTime
        } else {
            Long.MAX_VALUE
        }
    }

    /**
     * Check if connection appears healthy (received message recently)
     */
    fun isConnectionHealthy(): Boolean {
        // Consider unhealthy if no message received in last 2 minutes
        return isConnected() && getTimeSinceLastMessage() < 120_000
    }
}
