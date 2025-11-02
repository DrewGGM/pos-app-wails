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
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()

    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    // Flow to emit received messages for ViewModel to handle
    private val _messages = MutableStateFlow<WebSocketMessage?>(null)
    val messages: StateFlow<WebSocketMessage?> = _messages

    private var clientId: String? = null

    companion object {
        private const val TAG = "WebSocketManager"
        private const val WS_PORT = 8080
    }

    sealed class ConnectionState {
        object Disconnected : ConnectionState()
        object Connecting : ConnectionState()
        data class Connected(val clientId: String) : ConnectionState()
        data class Error(val message: String) : ConnectionState()
    }

    fun connect(serverIp: String) {
        if (_connectionState.value is ConnectionState.Connected) {
            Log.d(TAG, "Already connected")
            return
        }

        _connectionState.value = ConnectionState.Connecting

        val url = "ws://$serverIp:$WS_PORT/ws?type=waiter"
        val request = Request.Builder().url(url).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket connected")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                Log.d(TAG, "Received message: $text")
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
                        _connectionState.value = ConnectionState.Connected(id)
                        Log.d(TAG, "Authenticated with client ID: $id")
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
    }

    fun isConnected(): Boolean {
        return _connectionState.value is ConnectionState.Connected
    }
}
