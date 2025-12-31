package com.drewcore.kitchen_app.ui.viewmodel

import android.app.Application
import android.media.RingtoneManager
import android.net.Uri
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.drewcore.kitchen_app.data.models.ItemChangeStatus
import com.drewcore.kitchen_app.data.models.Order
import com.drewcore.kitchen_app.data.models.OrderDisplayState
import com.drewcore.kitchen_app.data.models.OrderItem
import com.drewcore.kitchen_app.data.network.ServerConnection
import com.drewcore.kitchen_app.data.network.ServerDiscovery
import com.drewcore.kitchen_app.data.network.WebSocketManager
import com.drewcore.kitchen_app.data.repository.OrderRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.min
import kotlin.math.pow

class KitchenViewModel(application: Application) : AndroidViewModel(application) {
    private val serverDiscovery = ServerDiscovery(application.applicationContext)
    private val webSocketManager = WebSocketManager()
    private val orderRepository = OrderRepository(application.applicationContext)

    private val _uiState = MutableStateFlow<UiState>(UiState.Loading)
    val uiState: StateFlow<UiState> = _uiState

    private val _activeOrders = MutableStateFlow<List<OrderDisplayState>>(emptyList())
    val activeOrders: StateFlow<List<OrderDisplayState>> = _activeOrders

    private val _completedOrders = MutableStateFlow<List<Order>>(emptyList())
    val completedOrders: StateFlow<List<Order>> = _completedOrders

    private val _soundEnabled = MutableStateFlow(true)
    val soundEnabled: StateFlow<Boolean> = _soundEnabled

    // Track recently updated orders (for visual indication)
    private val _updatedOrderIds = MutableStateFlow<Set<String>>(emptySet())
    val updatedOrderIds: StateFlow<Set<String>> = _updatedOrderIds

    // Track discovered order types from incoming orders
    private val _discoveredOrderTypes = MutableStateFlow<List<com.drewcore.kitchen_app.data.models.OrderType>>(emptyList())
    val discoveredOrderTypes: StateFlow<List<com.drewcore.kitchen_app.data.models.OrderType>> = _discoveredOrderTypes

    // Track orders marked as ready and their items with ACCUMULATED quantities
    // Map: orderId -> Map of item keys ("productId-notes") to total accumulated ready quantity
    // Using ConcurrentHashMap to prevent race conditions
    private val readyOrderItems = ConcurrentHashMap<String, ConcurrentHashMap<String, Int>>()

    // Track the full order quantities (before filtering) for accurate calculations
    // Map: orderId -> Map of item keys to actual order quantity
    // Using ConcurrentHashMap to prevent race conditions
    private val fullOrderQuantities = ConcurrentHashMap<String, Map<String, Int>>()

    private var serverConnection: ServerConnection? = null

    // Reconnection with exponential backoff
    private var reconnectAttempts = 0
    private val maxReconnectAttempts = 5
    private val baseReconnectDelayMs = 1000L
    private var lastReconnectTime = 0L // Track when last reconnect was attempted
    private val reconnectCooldownMs = 60000L // 1 minute cooldown after max attempts

    // Connection info for display
    private val _connectionInfo = MutableStateFlow<ConnectionInfo?>(null)
    val connectionInfo: StateFlow<ConnectionInfo?> = _connectionInfo

    companion object {
        private const val TAG = "KitchenViewModel"
    }

    data class ConnectionInfo(
        val address: String,
        val isTunnel: Boolean,
        val isSecure: Boolean
    )

    sealed class UiState {
        object Loading : UiState()
        object DiscoveringServer : UiState()
        object Connecting : UiState()
        data class Connected(val isTunnel: Boolean = false) : UiState()
        data class Error(val message: String) : UiState()
    }

    init {
        // Observe WebSocket connection state
        viewModelScope.launch {
            webSocketManager.connectionState.collect { state ->
                when (state) {
                    is WebSocketManager.ConnectionState.Connecting -> {
                        _uiState.value = UiState.Connecting
                    }
                    is WebSocketManager.ConnectionState.Connected -> {
                        _uiState.value = UiState.Connected(isTunnel = state.isTunnel)
                        onConnectionSuccess() // Reset reconnect attempts
                    }
                    is WebSocketManager.ConnectionState.Error -> {
                        _uiState.value = UiState.Error(state.message)
                    }
                    is WebSocketManager.ConnectionState.Disconnected -> {
                        if (_uiState.value is UiState.Connected) {
                            // Try to reconnect
                            reconnect()
                        }
                    }
                }
            }
        }

        // Observe new orders
        viewModelScope.launch {
            webSocketManager.newOrder.collect { order ->
                order?.let {
                    addNewOrder(it)
                    if (_soundEnabled.value) {
                        playNotificationSound()
                    }
                }
            }
        }

        // Observe order updates
        viewModelScope.launch {
            webSocketManager.orderUpdate.collect { update ->
                update?.let {
                    updateOrderStatus(it.orderId, it.status)
                }
            }
        }

        // Observe order cancellations
        viewModelScope.launch {
            webSocketManager.orderCancelled.collect { orderId ->
                orderId?.let {
                    removeOrderById(it)
                }
            }
        }

        // Start server discovery
        discoverAndConnect()
    }

    fun discoverAndConnect() {
        viewModelScope.launch {
            _uiState.value = UiState.DiscoveringServer

            val connection = serverDiscovery.discoverServerWithMode()
            if (connection != null) {
                serverConnection = connection
                _connectionInfo.value = ConnectionInfo(
                    address = connection.address,
                    isTunnel = connection.isTunnel,
                    isSecure = connection.isSecure
                )
                Log.d(TAG, "Connecting via ${if (connection.isTunnel) "tunnel" else "local network"}: ${connection.address}")
                webSocketManager.connect(connection)
            } else {
                _uiState.value = UiState.Error("No se encontró el servidor POS. Verifica la conexión de red o configura el túnel en Ajustes.")
            }
        }
    }

    fun connectWithManualIp(ip: String) {
        viewModelScope.launch {
            _uiState.value = UiState.DiscoveringServer

            // Validate IP format
            val ipRegex = Regex("^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$")
            if (!ipRegex.matches(ip)) {
                _uiState.value = UiState.Error("Formato de IP inválido. Usa formato: 192.168.1.100")
                return@launch
            }

            // Check if server exists at this IP
            val serverExists = serverDiscovery.checkServer(ip)
            if (serverExists) {
                val connection = ServerConnection(ip, isTunnel = false, isSecure = false)
                serverConnection = connection
                _connectionInfo.value = ConnectionInfo(
                    address = ip,
                    isTunnel = false,
                    isSecure = false
                )
                webSocketManager.connect(connection)
            } else {
                _uiState.value = UiState.Error("No se pudo conectar al servidor en $ip. Verifica que el servidor esté ejecutándose y que la IP sea correcta.")
            }
        }
    }

    fun connectWithTunnelUrl(url: String) {
        viewModelScope.launch {
            _uiState.value = UiState.DiscoveringServer

            // Check if tunnel URL is reachable
            val isReachable = serverDiscovery.checkTunnelUrl(url)
            if (isReachable) {
                val cleanUrl = url
                    .trim()
                    .removeSuffix("/")
                    .removePrefix("https://")
                    .removePrefix("http://")
                    .removePrefix("wss://")
                    .removePrefix("ws://")

                val connection = ServerConnection(cleanUrl, isTunnel = true, isSecure = true)
                serverConnection = connection
                _connectionInfo.value = ConnectionInfo(
                    address = cleanUrl,
                    isTunnel = true,
                    isSecure = true
                )
                webSocketManager.connect(connection)
            } else {
                _uiState.value = UiState.Error("No se pudo conectar al túnel en $url. Verifica que el túnel esté activo y la URL sea correcta.")
            }
        }
    }

    private fun reconnect() {
        serverConnection?.let { connection ->
            viewModelScope.launch {
                val now = System.currentTimeMillis()

                // Check if we're in cooldown period after max attempts
                if (reconnectAttempts >= maxReconnectAttempts) {
                    val timeSinceLastAttempt = now - lastReconnectTime
                    if (timeSinceLastAttempt < reconnectCooldownMs) {
                        Log.w(TAG, "In cooldown period, skipping reconnect (${(reconnectCooldownMs - timeSinceLastAttempt) / 1000}s remaining)")
                        _uiState.value = UiState.Error("No se pudo reconectar. Presiona 🔄 para reintentar.")
                        return@launch
                    } else {
                        // Cooldown expired, reset attempts
                        Log.d(TAG, "Cooldown expired, resetting reconnect attempts")
                        reconnectAttempts = 0
                    }
                }

                // Exponential backoff: 1s, 2s, 4s, 8s, 16s
                val delayMs = baseReconnectDelayMs * (2.0.pow(reconnectAttempts.toDouble())).toLong()
                val cappedDelayMs = min(delayMs, 30000L) // Max 30 seconds
                reconnectAttempts++
                lastReconnectTime = now

                Log.d(TAG, "Reconnecting in ${cappedDelayMs}ms (attempt $reconnectAttempts/$maxReconnectAttempts)")
                delay(cappedDelayMs)
                webSocketManager.connect(connection)
            }
        } ?: run {
            Log.e(TAG, "Cannot reconnect - no server connection info available")
            _uiState.value = UiState.Error("Información de conexión no disponible. Presiona 🔄 para buscar servidor nuevamente.")
        }
    }

    // Reset reconnect attempts on successful connection
    private fun onConnectionSuccess() {
        reconnectAttempts = 0
    }

    // Update discovered order types list
    private fun updateDiscoveredOrderTypes(orderType: com.drewcore.kitchen_app.data.models.OrderType) {
        val current = _discoveredOrderTypes.value.toMutableList()
        // Only add if not already present (check by code)
        if (current.none { it.code == orderType.code }) {
            current.add(orderType)
            _discoveredOrderTypes.value = current.sortedBy { it.name }
        }
    }

    private fun addNewOrder(order: Order) {
        val current = _activeOrders.value.toMutableList()

        // Save full order quantities for accurate tracking
        fullOrderQuantities[order.id] = order.items.associate {
            "${it.productId}-${it.notes}" to it.quantity
        }

        // Track order type if present
        order.orderType?.let { updateDiscoveredOrderTypes(it) }

        // Persist order to database
        viewModelScope.launch {
            try {
                orderRepository.insertActiveOrder(order)
                Log.d(TAG, "Persisted order to database: ${order.orderNumber}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to persist order to database", e)
            }
        }

        // Check if order already exists (prevent duplicates)
        val existingIndex = current.indexOfFirst { it.order.id == order.id }
        if (existingIndex != -1) {
            val existingOrder = current[existingIndex].order

            // Only mark as updated if items actually changed
            if (order.hasChangedItemsFrom(existingOrder)) {
                // Calculate item changes
                val orderWithChanges = calculateItemChanges(existingOrder, order)
                current[existingIndex] = OrderDisplayState(order = orderWithChanges, isCancelled = false)
                _activeOrders.value = current

                // Mark as updated for visual indication
                val updated = _updatedOrderIds.value.toMutableSet()
                updated.add(order.id)
                _updatedOrderIds.value = updated

                Log.d(TAG, "Updated existing order with changes: ${order.orderNumber}")
            } else {
                // No changes, just replace quietly without marking as updated
                current[existingIndex] = OrderDisplayState(order = order, isCancelled = false)
                _activeOrders.value = current
                Log.d(TAG, "Received duplicate order without changes: ${order.orderNumber}")
            }
        } else {
            // Check if this order was previously marked as ready
            val readyItems = readyOrderItems[order.id]
            if (readyItems != null && readyItems.isNotEmpty()) {
                // Order was marked ready before, filter out ready items and show only additional quantities
                val newItems = order.items.mapNotNull { item ->
                    val key = "${item.productId}-${item.notes}"
                    val readyQuantity = readyItems[key]

                    when {
                        readyQuantity == null -> {
                            // Item wasn't in the ready order - it's completely new
                            item.copy(changeStatus = ItemChangeStatus.ADDED)
                        }
                        item.quantity > readyQuantity -> {
                            // Item quantity increased - show only additional units
                            val additionalQuantity = item.quantity - readyQuantity
                            val newSubtotal = (item.subtotal / item.quantity) * additionalQuantity
                            item.copy(
                                quantity = additionalQuantity,
                                subtotal = newSubtotal,
                                changeStatus = ItemChangeStatus.ADDED,
                                previousQuantity = 0
                            )
                        }
                        else -> {
                            // Item quantity is same or less - don't show
                            null
                        }
                    }
                }

                if (newItems.isNotEmpty()) {
                    // Only show new items that weren't ready
                    val filteredOrder = order.copy(items = newItems)
                    current.add(OrderDisplayState(order = filteredOrder, isCancelled = false))
                    _activeOrders.value = current

                    // Mark as updated for visual indication
                    val updated = _updatedOrderIds.value.toMutableSet()
                    updated.add(order.id)
                    _updatedOrderIds.value = updated

                    Log.d(TAG, "Previously ready order received new items: ${order.orderNumber}, showing ${newItems.size} new items")
                } else {
                    Log.d(TAG, "Previously ready order received update but no new items to show: ${order.orderNumber}")
                }
            } else {
                // Truly new order, add to end of list (oldest first)
                current.add(OrderDisplayState(order = order, isCancelled = false))
                _activeOrders.value = current
                Log.d(TAG, "Added new order: ${order.orderNumber}")
            }
        }
    }

    private fun calculateItemChanges(oldOrder: Order, newOrder: Order): Order {
        // Get items that were marked as ready with their quantities (if order was previously ready)
        val readyItems = readyOrderItems[newOrder.id] ?: emptyMap()

        if (readyItems.isNotEmpty()) {
            Log.d(TAG, "Order ${newOrder.id} was previously marked ready. Ready items: $readyItems")
        }

        // Group items by productId for smarter matching
        val oldItemsByProduct = oldOrder.items.groupBy { it.productId }.toMutableMap()
        val matchedOldItems = mutableSetOf<String>() // Track which old items were matched

        val updatedItems = newOrder.items.mapNotNull { newItem ->
            val productId = newItem.productId
            val exactKey = "${newItem.productId}-${newItem.notes}"
            val readyQuantity = readyItems[exactKey]

            // Handle ready items first
            if (readyQuantity != null) {
                val additionalQuantity = newItem.quantity - readyQuantity
                if (additionalQuantity > 0) {
                    Log.d(TAG, "Item $exactKey had $readyQuantity ready, now has ${newItem.quantity}. Showing $additionalQuantity additional units")
                    val newSubtotal = (newItem.subtotal / newItem.quantity) * additionalQuantity
                    return@mapNotNull newItem.copy(
                        quantity = additionalQuantity,
                        subtotal = newSubtotal,
                        changeStatus = ItemChangeStatus.ADDED,
                        previousQuantity = 0
                    )
                } else {
                    Log.d(TAG, "Filtering out item $exactKey: no additional units")
                    return@mapNotNull null
                }
            }

            // Find matching old item - first try exact match (same productId and notes)
            val oldItemsForProduct = oldItemsByProduct[productId]?.toMutableList() ?: mutableListOf()
            var matchedOldItem: OrderItem? = null

            // First: try to find exact match (same productId and notes)
            val exactMatchIndex = oldItemsForProduct.indexOfFirst {
                it.notes == newItem.notes && "${it.productId}-${it.notes}" !in matchedOldItems
            }
            if (exactMatchIndex >= 0) {
                matchedOldItem = oldItemsForProduct[exactMatchIndex]
                matchedOldItems.add("${matchedOldItem.productId}-${matchedOldItem.notes}")
            } else {
                // Second: find any unmatched item with same productId (notes changed case)
                val anyMatchIndex = oldItemsForProduct.indexOfFirst {
                    "${it.productId}-${it.notes}" !in matchedOldItems
                }
                if (anyMatchIndex >= 0) {
                    matchedOldItem = oldItemsForProduct[anyMatchIndex]
                    matchedOldItems.add("${matchedOldItem.productId}-${matchedOldItem.notes}")
                    // This is likely a notes change - mark as modified
                    Log.d(TAG, "Item ${productId} notes changed from '${matchedOldItem.notes}' to '${newItem.notes}'")
                }
            }

            when {
                matchedOldItem == null -> {
                    // Truly new item
                    Log.d(TAG, "New item added: $exactKey")
                    newItem.copy(changeStatus = ItemChangeStatus.ADDED)
                }
                matchedOldItem.notes != newItem.notes -> {
                    // Notes changed - mark as modified (not as new item)
                    Log.d(TAG, "Item ${productId} modified (notes changed)")
                    newItem.copy(
                        changeStatus = ItemChangeStatus.MODIFIED,
                        previousQuantity = matchedOldItem.quantity
                    )
                }
                matchedOldItem.quantity != newItem.quantity -> {
                    // Quantity changed
                    Log.d(TAG, "Item ${productId} quantity changed: ${matchedOldItem.quantity} -> ${newItem.quantity}")
                    newItem.copy(
                        changeStatus = ItemChangeStatus.MODIFIED,
                        previousQuantity = matchedOldItem.quantity
                    )
                }
                else -> {
                    // Item unchanged
                    newItem.copy(changeStatus = ItemChangeStatus.UNCHANGED)
                }
            }
        }.toMutableList()

        // Find removed items (old items that weren't matched and aren't in ready items)
        val removedItems = oldOrder.items
            .filter { oldItem ->
                val key = "${oldItem.productId}-${oldItem.notes}"
                key !in matchedOldItems && key !in readyItems.keys
            }
            .map { oldItem ->
                Log.d(TAG, "Item REMOVED: ${oldItem.product.name}")
                oldItem.copy(changeStatus = ItemChangeStatus.REMOVED)
            }

        // Add removed items to the list (they will be shown with strikethrough)
        updatedItems.addAll(removedItems)

        return newOrder.copy(items = updatedItems)
    }

    fun clearUpdateIndicator(orderId: String) {
        val updated = _updatedOrderIds.value.toMutableSet()
        updated.remove(orderId)
        _updatedOrderIds.value = updated
    }

    fun markOrderAsReady(order: Order) {
        // Get or create the ready items map for this order (thread-safe)
        val currentReadyItems = readyOrderItems.getOrPut(order.id) { ConcurrentHashMap() }

        // Get full order quantities (before any filtering)
        val fullQuantities = fullOrderQuantities[order.id] ?: emptyMap()

        // Accumulate ready quantities from full order quantities
        for ((key, fullQty) in fullQuantities) {
            val currentReady = currentReadyItems[key] ?: 0
            // Set ready quantity to the full current quantity
            currentReadyItems[key] = fullQty
            Log.d(TAG, "Item $key: was ready=$currentReady, now marking full quantity=$fullQty as ready")
        }

        Log.d(TAG, "Saved accumulated ready items for order ${order.id}: $currentReadyItems")

        // Remove from active orders
        val active = _activeOrders.value.toMutableList()
        active.removeAll { it.order.id == order.id }
        _activeOrders.value = active

        // Add to completed orders
        val completed = _completedOrders.value.toMutableList()
        completed.add(0, order)
        _completedOrders.value = completed

        // Persist to database as completed
        viewModelScope.launch {
            try {
                orderRepository.markOrderAsCompleted(order.id)
                Log.d(TAG, "Marked order as completed in database: ${order.orderNumber}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to mark order as completed in database", e)
            }
        }

        // Send update to server
        webSocketManager.sendOrderStatusUpdate(order.id, "ready")
    }

    fun removeFromHistory(order: Order) {
        val completed = _completedOrders.value.toMutableList()
        completed.remove(order)
        _completedOrders.value = completed

        // Delete from database
        viewModelScope.launch {
            try {
                orderRepository.deleteOrder(order.id)
                Log.d(TAG, "Deleted order from database: ${order.orderNumber}")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to delete order from database", e)
            }
        }
    }

    fun undoCompletion(order: Order) {
        // Remove from completed
        val completed = _completedOrders.value.toMutableList()
        completed.remove(order)
        _completedOrders.value = completed

        // DON'T clear ready items tracking - keep the accumulated ready quantities
        // This allows us to show only new additions if the order is updated again
        Log.d(TAG, "Undo completion for order ${order.id}, keeping ready items: ${readyOrderItems[order.id]}")

        // Add back to active
        val active = _activeOrders.value.toMutableList()
        active.add(OrderDisplayState(order = order, isCancelled = false))
        _activeOrders.value = active

        // Send update to server
        webSocketManager.sendOrderStatusUpdate(order.id, "preparing")
    }

    fun toggleSound() {
        _soundEnabled.value = !_soundEnabled.value
    }

    private fun updateOrderStatus(orderId: String, status: String) {
        // Update order in active list if found
        val active = _activeOrders.value.toMutableList()
        val index = active.indexOfFirst { it.order.id == orderId }
        if (index != -1) {
            // Order status updated from POS
            if (status == "cancelled") {
                // Mark as cancelled and schedule removal
                val currentTime = System.currentTimeMillis()
                active[index] = active[index].copy(
                    isCancelled = true,
                    cancelledAtMs = currentTime
                )
                _activeOrders.value = active

                // Schedule automatic removal after 10 seconds
                viewModelScope.launch {
                    delay(10000)
                    removeCancelledOrder(orderId, currentTime)
                }

                Log.d(TAG, "Order ${orderId} marked as cancelled")
            }
        }
    }

    private fun removeCancelledOrder(orderId: String, cancelledAtMs: Long) {
        val active = _activeOrders.value.toMutableList()
        val index = active.indexOfFirst {
            it.order.id == orderId &&
            it.isCancelled &&
            it.cancelledAtMs == cancelledAtMs
        }

        if (index != -1) {
            active.removeAt(index)
            _activeOrders.value = active
            Log.d(TAG, "Auto-removed cancelled order: $orderId")

            // Delete from database
            viewModelScope.launch {
                try {
                    orderRepository.deleteOrder(orderId)
                    Log.d(TAG, "Deleted cancelled order from database: $orderId")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to delete cancelled order from database", e)
                }
            }
        }
    }

    fun manuallyRemoveCancelledOrder(orderId: String) {
        val active = _activeOrders.value.toMutableList()
        active.removeAll { it.order.id == orderId && it.isCancelled }
        _activeOrders.value = active
        Log.d(TAG, "Manually removed cancelled order: $orderId")
    }

    private fun removeOrderById(orderId: String) {
        // Mark order as cancelled first (to show visual feedback) before removing
        val active = _activeOrders.value.toMutableList()
        val index = active.indexOfFirst { it.order.id == orderId }

        if (index != -1) {
            // Mark as cancelled visually (red card, strikethrough items)
            val currentTime = System.currentTimeMillis()
            active[index] = active[index].copy(
                isCancelled = true,
                cancelledAtMs = currentTime
            )
            _activeOrders.value = active
            Log.d(TAG, "Order marked as cancelled via WebSocket: $orderId")

            // Schedule automatic removal after 10 seconds
            viewModelScope.launch {
                delay(10000)
                removeCancelledOrder(orderId, currentTime)

                // Clean up tracking maps after removal
                readyOrderItems.remove(orderId)
                fullOrderQuantities.remove(orderId)
            }
        }

        // Also remove from completed list if present (immediately)
        val completed = _completedOrders.value.toMutableList()
        val removedFromCompleted = completed.removeAll { it.id == orderId }
        if (removedFromCompleted) {
            _completedOrders.value = completed
        }
    }

    private fun playNotificationSound() {
        try {
            val notification: Uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val ringtone = RingtoneManager.getRingtone(getApplication(), notification)
            ringtone.play()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun onCleared() {
        super.onCleared()
        webSocketManager.cleanup()
    }
}
