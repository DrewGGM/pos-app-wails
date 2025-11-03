package com.drewcore.kitchen_app.ui.viewmodel

import android.app.Application
import android.media.RingtoneManager
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.drewcore.kitchen_app.data.models.ItemChangeStatus
import com.drewcore.kitchen_app.data.models.Order
import com.drewcore.kitchen_app.data.models.OrderDisplayState
import com.drewcore.kitchen_app.data.network.ServerDiscovery
import com.drewcore.kitchen_app.data.network.WebSocketManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class KitchenViewModel(application: Application) : AndroidViewModel(application) {
    private val serverDiscovery = ServerDiscovery(application.applicationContext)
    private val webSocketManager = WebSocketManager()

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

    // Track orders marked as ready and their items with quantities at that moment
    // Map: orderId -> Map of item keys ("productId-notes") to quantity that were ready
    private val readyOrderItems = mutableMapOf<String, Map<String, Int>>()

    private var serverIp: String? = null

    sealed class UiState {
        object Loading : UiState()
        object DiscoveringServer : UiState()
        object Connecting : UiState()
        object Connected : UiState()
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
                        _uiState.value = UiState.Connected
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

            val ip = serverDiscovery.discoverServer()
            if (ip != null) {
                serverIp = ip
                webSocketManager.connect(ip)
            } else {
                _uiState.value = UiState.Error("No se encontró el servidor POS en la red local")
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
                serverIp = ip
                webSocketManager.connect(ip)
            } else {
                _uiState.value = UiState.Error("No se pudo conectar al servidor en $ip. Verifica que el servidor esté ejecutándose y que la IP sea correcta.")
            }
        }
    }

    private fun reconnect() {
        serverIp?.let { ip ->
            viewModelScope.launch {
                delay(3000) // Wait 3 seconds before reconnecting
                webSocketManager.connect(ip)
            }
        }
    }

    private fun addNewOrder(order: Order) {
        val current = _activeOrders.value.toMutableList()

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

                android.util.Log.d("KitchenViewModel", "Updated existing order with changes: ${order.orderNumber}")
            } else {
                // No changes, just replace quietly without marking as updated
                current[existingIndex] = OrderDisplayState(order = order, isCancelled = false)
                _activeOrders.value = current
                android.util.Log.d("KitchenViewModel", "Received duplicate order without changes: ${order.orderNumber}")
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
                            item.changeStatus = ItemChangeStatus.ADDED
                            item
                        }
                        item.quantity > readyQuantity -> {
                            // Item quantity increased - show only additional units
                            val additionalQuantity = item.quantity - readyQuantity
                            val newSubtotal = (item.subtotal / item.quantity) * additionalQuantity
                            item.copy(
                                quantity = additionalQuantity,
                                subtotal = newSubtotal
                            ).apply {
                                changeStatus = ItemChangeStatus.ADDED
                                previousQuantity = 0
                            }
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

                    android.util.Log.d("KitchenViewModel", "Previously ready order received new items: ${order.orderNumber}, showing ${newItems.size} new items")
                } else {
                    android.util.Log.d("KitchenViewModel", "Previously ready order received update but no new items to show: ${order.orderNumber}")
                }
            } else {
                // Truly new order, add to end of list (oldest first)
                current.add(OrderDisplayState(order = order, isCancelled = false))
                _activeOrders.value = current
                android.util.Log.d("KitchenViewModel", "Added new order: ${order.orderNumber}")
            }
        }
    }

    private fun calculateItemChanges(oldOrder: Order, newOrder: Order): Order {
        val oldItemsMap = oldOrder.items.associateBy { "${it.productId}-${it.notes}" }
        val newItemsMap = newOrder.items.associateBy { "${it.productId}-${it.notes}" }

        // Get items that were marked as ready with their quantities (if order was previously ready)
        val readyItems = readyOrderItems[newOrder.id] ?: emptyMap()

        if (readyItems.isNotEmpty()) {
            android.util.Log.d("KitchenViewModel", "Order ${newOrder.id} was previously marked ready. Ready items: $readyItems")
        }

        val updatedItems = newOrder.items.mapNotNull { newItem ->
            val key = "${newItem.productId}-${newItem.notes}"
            val oldItem = oldItemsMap[key]
            val readyQuantity = readyItems[key]

            when {
                readyQuantity != null -> {
                    // Item was already marked as ready - check if there are additional units
                    val additionalQuantity = newItem.quantity - readyQuantity
                    if (additionalQuantity > 0) {
                        // There are additional units - show only those
                        android.util.Log.d("KitchenViewModel", "Item $key had $readyQuantity ready, now has ${newItem.quantity}. Showing $additionalQuantity additional units")
                        val newSubtotal = (newItem.subtotal / newItem.quantity) * additionalQuantity
                        newItem.copy(
                            quantity = additionalQuantity,
                            subtotal = newSubtotal
                        ).apply {
                            changeStatus = ItemChangeStatus.ADDED
                            previousQuantity = 0
                        }
                    } else {
                        // No additional units or fewer units than before - don't show
                        android.util.Log.d("KitchenViewModel", "Filtering out item $key: no additional units (ready: $readyQuantity, current: ${newItem.quantity})")
                        null
                    }
                }
                oldItem == null -> {
                    // New item added
                    newItem.changeStatus = ItemChangeStatus.ADDED
                    android.util.Log.d("KitchenViewModel", "New item added: $key")
                    newItem
                }
                oldItem.quantity != newItem.quantity -> {
                    // Item quantity modified
                    newItem.changeStatus = ItemChangeStatus.MODIFIED
                    newItem.previousQuantity = oldItem.quantity
                    newItem
                }
                else -> {
                    // Item unchanged
                    newItem.changeStatus = ItemChangeStatus.UNCHANGED
                    newItem
                }
            }
        }.toMutableList()

        // Find removed items (only from non-ready items)
        val removedItems = oldItemsMap.filterKeys { !newItemsMap.containsKey(it) && !readyItems.containsKey(it) }
            .values.map { oldItem ->
                oldItem.changeStatus = ItemChangeStatus.REMOVED
                oldItem
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
        // Save which items were ready with their quantities
        readyOrderItems[order.id] = order.items.associate {
            "${it.productId}-${it.notes}" to it.quantity
        }
        android.util.Log.d("KitchenViewModel", "Saved ready items for order ${order.id}: ${readyOrderItems[order.id]}")

        // Remove from active orders
        val active = _activeOrders.value.toMutableList()
        active.removeAll { it.order.id == order.id }
        _activeOrders.value = active

        // Add to completed orders
        val completed = _completedOrders.value.toMutableList()
        completed.add(0, order)
        _completedOrders.value = completed

        // Send update to server
        webSocketManager.sendOrderStatusUpdate(order.id, "ready")
    }

    fun removeFromHistory(order: Order) {
        val completed = _completedOrders.value.toMutableList()
        completed.remove(order)
        _completedOrders.value = completed
    }

    fun undoCompletion(order: Order) {
        // Remove from completed
        val completed = _completedOrders.value.toMutableList()
        completed.remove(order)
        _completedOrders.value = completed

        // Clear ready items tracking (order is no longer ready)
        readyOrderItems.remove(order.id)
        android.util.Log.d("KitchenViewModel", "Cleared ready items for order ${order.id} after undo")

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

                android.util.Log.d("KitchenViewModel", "Order ${orderId} marked as cancelled")
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
            android.util.Log.d("KitchenViewModel", "Auto-removed cancelled order: $orderId")
        }
    }

    fun manuallyRemoveCancelledOrder(orderId: String) {
        val active = _activeOrders.value.toMutableList()
        active.removeAll { it.order.id == orderId && it.isCancelled }
        _activeOrders.value = active
        android.util.Log.d("KitchenViewModel", "Manually removed cancelled order: $orderId")
    }

    private fun removeOrderById(orderId: String) {
        // Remove order from active list (called when order_cancelled message received)
        val active = _activeOrders.value.toMutableList()
        val removed = active.removeAll { it.order.id == orderId }
        if (removed) {
            _activeOrders.value = active
            android.util.Log.d("KitchenViewModel", "Order removed via WebSocket cancellation: $orderId")
        }

        // Also remove from completed list if present
        val completed = _completedOrders.value.toMutableList()
        completed.removeAll { it.id == orderId }
        _completedOrders.value = completed

        // Clean up ready items tracking
        readyOrderItems.remove(orderId)
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
        webSocketManager.disconnect()
    }
}
