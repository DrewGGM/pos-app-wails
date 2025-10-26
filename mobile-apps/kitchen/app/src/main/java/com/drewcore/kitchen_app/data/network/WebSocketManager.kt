package com.drewcore.kitchen_app.data.network

import android.util.Log
import com.drewcore.kitchen_app.data.models.Order
import com.drewcore.kitchen_app.data.models.WebSocketMessage
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
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

    private val _newOrder = MutableStateFlow<Order?>(null)
    val newOrder: StateFlow<Order?> = _newOrder

    private val _orderUpdate = MutableStateFlow<OrderUpdate?>(null)
    val orderUpdate: StateFlow<OrderUpdate?> = _orderUpdate

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

    data class OrderUpdate(
        val orderId: String,
        val status: String
    )

    fun connect(serverIp: String) {
        if (_connectionState.value is ConnectionState.Connected) {
            Log.d(TAG, "Already connected")
            return
        }

        _connectionState.value = ConnectionState.Connecting

        val url = "ws://$serverIp:$WS_PORT/ws?type=kitchen"
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
                    val success = message.data["success"] as? Boolean ?: false
                    val id = message.data["client_id"] as? String

                    if (success && id != null) {
                        clientId = id
                        _connectionState.value = ConnectionState.Connected(id)
                        Log.d(TAG, "Authenticated with client ID: $id")
                    }
                }

                "kitchen_order", "order_new" -> {
                    // Parse order from data
                    val orderJson = gson.toJson(message.data)
                    val order = gson.fromJson(orderJson, Order::class.java)
                    // Clean up IDs to remove .0 from Double conversion
                    val cleanedOrder = cleanOrderIds(order)
                    _newOrder.value = cleanedOrder
                    Log.d(TAG, "New order received: ${cleanedOrder.orderNumber}")
                }

                "order_update" -> {
                    val orderId = message.data["order_id"]?.toString()
                    val status = message.data["status"] as? String

                    if (orderId != null && status != null) {
                        _orderUpdate.value = OrderUpdate(orderId, status)
                        Log.d(TAG, "Order update: $orderId -> $status")
                    }
                }

                "heartbeat" -> {
                    Log.d(TAG, "Heartbeat received")
                }

                else -> {
                    Log.d(TAG, "Unknown message type: ${message.type}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling message", e)
        }
    }

    fun sendOrderStatusUpdate(orderId: String, status: String) {
        val message = mapOf(
            "type" to "kitchen_update",
            "timestamp" to System.currentTimeMillis().toString(),
            "data" to mapOf(
                "order_id" to orderId,
                "status" to status,
                "time" to System.currentTimeMillis()
            )
        )

        val json = gson.toJson(message)
        webSocket?.send(json)
        Log.d(TAG, "Sent status update: $orderId -> $status")
    }

    private fun cleanOrderIds(order: Order): Order {
        // Clean ID format - remove .0 from Double conversion (e.g., "39.0" -> "39")
        fun cleanId(id: String): String {
            return if (id.endsWith(".0")) {
                id.substring(0, id.length - 2)
            } else {
                id
            }
        }

        return order.copy(
            id = cleanId(order.id),
            tableId = order.tableId?.let { cleanId(it) },
            items = order.items.map { item ->
                item.copy(
                    id = cleanId(item.id),
                    productId = cleanId(item.productId),
                    product = item.product.copy(
                        id = cleanId(item.product.id)
                    )
                )
            }
        )
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
