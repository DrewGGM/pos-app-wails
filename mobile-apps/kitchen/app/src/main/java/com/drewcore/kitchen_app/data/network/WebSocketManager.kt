package com.drewcore.kitchen_app.data.network

import android.util.Log
import com.drewcore.kitchen_app.data.models.ItemChangeStatus
import com.drewcore.kitchen_app.data.models.Order
import com.drewcore.kitchen_app.data.models.OrderItem
import com.drewcore.kitchen_app.data.models.Product
import com.drewcore.kitchen_app.data.models.WebSocketMessage
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.reflect.TypeToken
import java.lang.reflect.Type
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

    // Custom Gson that handles Kotlin default values for OrderItem
    private val gson: Gson = GsonBuilder()
        .registerTypeAdapter(OrderItem::class.java, OrderItemDeserializer())
        .create()

    // Custom deserializer to handle OrderItem with default values for changeStatus
    private class OrderItemDeserializer : com.google.gson.JsonDeserializer<OrderItem> {
        private val defaultGson = Gson()

        override fun deserialize(
            json: com.google.gson.JsonElement,
            typeOfT: Type,
            context: com.google.gson.JsonDeserializationContext
        ): OrderItem {
            val jsonObject = json.asJsonObject

            // Parse required fields
            val id = jsonObject.get("id")?.asString ?: ""
            val productId = jsonObject.get("product_id")?.asString ?: ""
            val product = context.deserialize<Product>(jsonObject.get("product"), Product::class.java)
            val quantity = jsonObject.get("quantity")?.asInt ?: 0
            val price = jsonObject.get("price")?.asDouble ?: 0.0
            val subtotal = jsonObject.get("subtotal")?.asDouble ?: 0.0
            val notes = jsonObject.get("notes")?.asString

            // Parse modifiers if present
            val modifiersJson = jsonObject.get("modifiers")
            val modifiers = if (modifiersJson != null && !modifiersJson.isJsonNull) {
                val listType = object : TypeToken<List<com.drewcore.kitchen_app.data.models.OrderItemModifier>>() {}.type
                context.deserialize<List<com.drewcore.kitchen_app.data.models.OrderItemModifier>>(modifiersJson, listType)
            } else {
                null
            }

            // Create OrderItem with default values for local metadata
            return OrderItem(
                id = id,
                productId = productId,
                product = product,
                quantity = quantity,
                price = price,
                subtotal = subtotal,
                notes = notes,
                modifiers = modifiers,
                changeStatus = ItemChangeStatus.UNCHANGED,
                previousQuantity = null
            )
        }
    }

    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState

    private val _newOrder = MutableStateFlow<Order?>(null)
    val newOrder: StateFlow<Order?> = _newOrder

    private val _orderUpdate = MutableStateFlow<OrderUpdate?>(null)
    val orderUpdate: StateFlow<OrderUpdate?> = _orderUpdate

    private val _orderCancelled = MutableStateFlow<String?>(null)
    val orderCancelled: StateFlow<String?> = _orderCancelled

    private var clientId: String? = null

    companion object {
        private const val TAG = "WebSocketManager"
        private const val WS_PORT = 8080
    }

    // Store current connection info
    private var currentConnection: ServerConnection? = null

    sealed class ConnectionState {
        object Disconnected : ConnectionState()
        object Connecting : ConnectionState()
        data class Connected(val clientId: String, val isTunnel: Boolean = false) : ConnectionState()
        data class Error(val message: String) : ConnectionState()
    }

    data class OrderUpdate(
        val orderId: String,
        val status: String
    )

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
            "$protocol://${connection.address}/ws?type=kitchen"
        } else {
            // Local connection uses IP and port
            "ws://${connection.address}:$WS_PORT/ws?type=kitchen"
        }

        Log.d(TAG, "Connecting to WebSocket: $url (tunnel: ${connection.isTunnel})")
        val request = Request.Builder().url(url).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket connected via ${if (connection.isTunnel) "tunnel" else "local network"}")
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

    /**
     * Legacy connect method for backward compatibility - uses local network only
     */
    fun connect(serverIp: String) {
        connect(ServerConnection(serverIp, isTunnel = false, isSecure = false))
    }

    /**
     * Legacy connect method with explicit tunnel URL support (for manual override)
     */
    fun connectToUrl(url: String, isSecure: Boolean = true) {
        if (_connectionState.value is ConnectionState.Connected) {
            Log.d(TAG, "Already connected")
            return
        }

        _connectionState.value = ConnectionState.Connecting

        val cleanUrl = url
            .removePrefix("wss://")
            .removePrefix("ws://")
            .removePrefix("https://")
            .removePrefix("http://")

        currentConnection = ServerConnection(cleanUrl, isTunnel = true, isSecure = isSecure)

        val protocol = if (isSecure) "wss" else "ws"
        val wsUrl = "$protocol://$cleanUrl/ws?type=kitchen"
        Log.d(TAG, "Connecting to WebSocket URL: $wsUrl")

        val request = Request.Builder().url(wsUrl).build()

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
                        val isTunnel = currentConnection?.isTunnel ?: false
                        _connectionState.value = ConnectionState.Connected(id, isTunnel)
                        Log.d(TAG, "Authenticated with client ID: $id (tunnel: $isTunnel)")
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

                    // Send acknowledgment back to server
                    sendKitchenAck(cleanedOrder.id, cleanedOrder.orderNumber)
                }

                "order_update" -> {
                    // Try to parse as full order first (from REST API broadcasts)
                    try {
                        val orderJson = gson.toJson(message.data)
                        val order = gson.fromJson(orderJson, Order::class.java)
                        val cleanedOrder = cleanOrderIds(order)
                        _newOrder.value = cleanedOrder
                        Log.d(TAG, "Order update received (full order): ${cleanedOrder.orderNumber}")
                    } catch (e: Exception) {
                        // Fallback to status update only
                        val orderId = message.data["order_id"]?.toString()
                        val status = message.data["status"] as? String

                        if (orderId != null && status != null) {
                            _orderUpdate.value = OrderUpdate(orderId, status)
                            Log.d(TAG, "Order update (status only): $orderId -> $status")
                        }
                    }
                }

                "order_cancelled" -> {
                    // Parse cancelled order ID and clean it (remove .0 suffix if present)
                    val rawOrderId = message.data["id"]?.toString()
                    if (rawOrderId != null) {
                        // Clean the ID - remove .0 suffix from Double conversion
                        val orderId = if (rawOrderId.endsWith(".0")) {
                            rawOrderId.substring(0, rawOrderId.length - 2)
                        } else {
                            rawOrderId
                        }
                        _orderCancelled.value = orderId
                        Log.d(TAG, "Order cancelled: $orderId (raw: $rawOrderId)")
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

    /**
     * Send acknowledgment that kitchen has received the order
     */
    fun sendKitchenAck(orderId: String, orderNumber: String) {
        val message = mapOf(
            "type" to "kitchen_ack",
            "timestamp" to System.currentTimeMillis().toString(),
            "data" to mapOf(
                "order_id" to orderId.toIntOrNull() ?: 0,
                "order_number" to orderNumber
            )
        )

        val json = gson.toJson(message)
        webSocket?.send(json)
        Log.d(TAG, "Sent kitchen acknowledgment for order: $orderNumber (ID: $orderId)")
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

    fun getCurrentConnection(): ServerConnection? {
        return currentConnection
    }

    fun isConnectedViaTunnel(): Boolean {
        return currentConnection?.isTunnel == true && isConnected()
    }
}
