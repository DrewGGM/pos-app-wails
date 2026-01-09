package com.drewcore.waiter_app.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.drewcore.waiter_app.data.models.*
import com.drewcore.waiter_app.data.network.PosApiService
import com.drewcore.waiter_app.data.network.ServerDiscovery
import com.drewcore.waiter_app.data.network.WebSocketManager
import com.drewcore.waiter_app.data.network.ServerConnection
import com.drewcore.waiter_app.data.preferences.WaiterPreferences
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class WaiterViewModel(application: Application) : AndroidViewModel(application) {
    private val serverDiscovery = ServerDiscovery(application.applicationContext)
    private val webSocketManager = WebSocketManager()
    private val preferences = WaiterPreferences(application.applicationContext)

    private val _uiState = MutableStateFlow<UiState>(UiState.Loading)
    val uiState: StateFlow<UiState> = _uiState

    private val _products = MutableStateFlow<List<Product>>(emptyList())
    val products: StateFlow<List<Product>> = _products

    private val _tables = MutableStateFlow<List<Table>>(emptyList())
    val tables: StateFlow<List<Table>> = _tables

    // NEW: Map of table ID -> order total for occupied tables
    private val _tableTotals = MutableStateFlow<Map<Int, Double>>(emptyMap())
    val tableTotals: StateFlow<Map<Int, Double>> = _tableTotals

    private val _tableAreas = MutableStateFlow<List<TableArea>>(emptyList())
    val tableAreas: StateFlow<List<TableArea>> = _tableAreas

    private val _selectedTable = MutableStateFlow<Table?>(null)
    val selectedTable: StateFlow<Table?> = _selectedTable

    private val _orderTypes = MutableStateFlow<List<OrderType>>(emptyList())
    val orderTypes: StateFlow<List<OrderType>> = _orderTypes

    private val _selectedOrderType = MutableStateFlow<OrderType?>(null)
    val selectedOrderType: StateFlow<OrderType?> = _selectedOrderType

    private val _deliveryInfo = MutableStateFlow<com.drewcore.waiter_app.ui.components.DeliveryInfo?>(null)
    val deliveryInfo: StateFlow<com.drewcore.waiter_app.ui.components.DeliveryInfo?> = _deliveryInfo

    private val _orders = MutableStateFlow<List<OrderResponse>>(emptyList())
    val orders: StateFlow<List<OrderResponse>> = _orders

    private val _cart = MutableStateFlow<List<CartItem>>(emptyList())
    val cart: StateFlow<List<CartItem>> = _cart

    private val _selectedCategory = MutableStateFlow<String?>(null)
    val selectedCategory: StateFlow<String?> = _selectedCategory

    private val _customPages = MutableStateFlow<List<CustomPage>>(emptyList())
    val customPages: StateFlow<List<CustomPage>> = _customPages

    private val _selectedCustomPage = MutableStateFlow<CustomPage?>(null)
    val selectedCustomPage: StateFlow<CustomPage?> = _selectedCustomPage

    private val _customPageProducts = MutableStateFlow<List<Product>>(emptyList())
    val customPageProducts: StateFlow<List<Product>> = _customPageProducts

    private val _currentScreen = MutableStateFlow<Screen>(Screen.TableSelection)
    val currentScreen: StateFlow<Screen> = _currentScreen

    private val _currentOrderId = MutableStateFlow<Int?>(null)
    val currentOrderId: StateFlow<Int?> = _currentOrderId

    // Connection info for background service
    private val _connectionInfo = MutableStateFlow<ServerConnection?>(null)
    val connectionInfo: StateFlow<ServerConnection?> = _connectionInfo

    // Kitchen acknowledgment tracking
    data class PendingKitchenAck(
        val orderId: Int,
        val orderNumber: String,
        val sentAt: Long = System.currentTimeMillis()
    )
    private val _pendingKitchenAck = MutableStateFlow<PendingKitchenAck?>(null)
    val pendingKitchenAck: StateFlow<PendingKitchenAck?> = _pendingKitchenAck

    private val _showKitchenRetryDialog = MutableStateFlow(false)
    val showKitchenRetryDialog: StateFlow<Boolean> = _showKitchenRetryDialog

    private var kitchenAckTimeoutJob: Job? = null

    // Cache of recently received acks to handle race condition
    // (ack may arrive before we set pending state)
    private val recentAcks = mutableMapOf<Int, Long>() // orderId -> timestamp

    // Configuration for kitchen acknowledgment (will be loaded from server)
    private var kitchenAckEnabled = false

    companion object {
        private const val KITCHEN_ACK_TIMEOUT_MS = 5000L // 5 seconds timeout for kitchen acknowledgment
        private const val ACK_CACHE_EXPIRY_MS = 30000L // 30 seconds cache for recent acks
    }

    private var apiService: PosApiService? = null
    private var serverIp: String? = null
    private var orderCounter = 0

    sealed class UiState {
        object Loading : UiState()
        object DiscoveringServer : UiState()
        object LoadingData : UiState()
        object Ready : UiState()
        object SendingOrder : UiState()
        data class OrderSent(val orderNumber: String) : UiState()
        data class Error(val message: String) : UiState()
    }

    sealed class Screen {
        object TableSelection : Screen()
        object ProductSelection : Screen()
        object OrdersList : Screen()
        object Settings : Screen()
        object SplitBill : Screen()
    }

    val cartTotal: Double
        get() = _cart.value.sumOf { it.subtotal }

    val cartItemCount: Int
        get() = _cart.value.sumOf { it.quantity }

    val categories: List<String>
        get() = _products.value.mapNotNull { it.category }.distinct().sorted()

    val availableTables: List<Table>
        get() = _tables.value.filter { it.status == "available" }

    // For table switching: show all tables except the current one
    fun getTablesForSwitching(currentTableId: Int?): List<Table> {
        return _tables.value.filter { it.id != currentTableId }
    }

    init {
        android.util.Log.d("WaiterViewModel", "========== INIT CALLED ==========")

        // Observe WebSocket connection state
        viewModelScope.launch {
            webSocketManager.connectionState.collect { state ->
                android.util.Log.d("WaiterViewModel", "WebSocket state changed: ${state.javaClass.simpleName}, current UI state: ${_uiState.value.javaClass.simpleName}")

                when (state) {
                    is WebSocketManager.ConnectionState.Connected -> {
                        android.util.Log.d("WaiterViewModel", "WebSocket Connected. Current UI state: ${_uiState.value.javaClass.simpleName}")

                        // Emit connection info for background service
                        webSocketManager.getCurrentConnection()?.let { conn ->
                            _connectionInfo.value = conn
                        }

                        // Only load data if we're in DiscoveringServer state (freshly connected after discovery)
                        // This prevents automatic data loading if WebSocket reconnects while in Error state
                        if (_uiState.value == UiState.DiscoveringServer) {
                            android.util.Log.d("WaiterViewModel", "UI state is DiscoveringServer, calling loadInitialData()")
                            loadInitialData()
                        } else if (_uiState.value is UiState.Error) {
                            // If we were in error state and now connected, load data and go to Ready
                            android.util.Log.d("WaiterViewModel", "Was in Error state, loading data after reconnect")
                            loadInitialData()
                        } else {
                            android.util.Log.d("WaiterViewModel", "UI state is NOT DiscoveringServer, SKIPPING loadInitialData()")
                        }
                    }
                    is WebSocketManager.ConnectionState.Error -> {
                        android.util.Log.d("WaiterViewModel", "WebSocket Error: ${state.message}")
                        // Only show WebSocket error if we're not already in a discovery error state
                        if (_uiState.value != UiState.Error("No se encontró el servidor POS en la red local")) {
                            android.util.Log.d("WaiterViewModel", "Setting UI state to Error: ${state.message}")
                            _uiState.value = UiState.Error(state.message)
                        } else {
                            android.util.Log.d("WaiterViewModel", "Already in discovery error state, not changing")
                        }
                    }
                    is WebSocketManager.ConnectionState.Disconnected -> {
                        android.util.Log.d("WaiterViewModel", "WebSocket Disconnected")
                        if (_uiState.value == UiState.Ready) {
                            android.util.Log.d("WaiterViewModel", "Was Ready, setting to Error")
                            _uiState.value = UiState.Error("Desconectado del servidor. Intenta reconectar.")
                        }
                    }
                    else -> {
                        android.util.Log.d("WaiterViewModel", "WebSocket other state: ${state.javaClass.simpleName}")
                    }
                }
            }
        }

        // Listen for WebSocket messages and update data accordingly
        viewModelScope.launch {
            webSocketManager.messages.collect { message ->
                message?.let {
                    android.util.Log.d("WaiterViewModel", "Received WebSocket message: ${it.type}")
                    when (it.type) {
                        "table_update" -> {
                            // Reload tables when there's a table update
                            android.util.Log.d("WaiterViewModel", "Reloading tables due to table_update")
                            refreshTables()
                            updateTableTotals() // NEW: Update totals when tables update
                        }
                        "order_new", "order_update", "order_ready", "order_cancelled" -> {
                            // Reload orders and tables for any order change
                            android.util.Log.d("WaiterViewModel", "Reloading data due to ${it.type}")
                            refreshTables()
                            refreshOrders()
                            updateTableTotals() // NEW: Update totals when orders change
                        }
                        "kitchen_order" -> {
                            // Reload both tables and orders when order goes to kitchen
                            android.util.Log.d("WaiterViewModel", "Reloading data due to kitchen_order")
                            refreshTables()
                            refreshOrders()
                            updateTableTotals() // NEW: Update totals
                        }
                        "product_update", "product_new", "product_deleted" -> {
                            // Reload products when there's a product change
                            android.util.Log.d("WaiterViewModel", "Reloading products due to ${it.type}")
                            refreshProducts()
                        }
                        "notification" -> {
                            // Handle general notifications
                            android.util.Log.d("WaiterViewModel", "Notification received")
                        }
                    }
                }
            }
        }

        // Listen for kitchen acknowledgment results
        viewModelScope.launch {
            webSocketManager.kitchenAckResult.collect { ackResult ->
                ackResult?.let {
                    android.util.Log.d("WaiterViewModel", "Kitchen ack received for order: ${it.orderNumber} (ID: ${it.orderId})")

                    // Always cache the ack (to handle race condition where ack arrives before pending state is set)
                    recentAcks[it.orderId] = System.currentTimeMillis()
                    cleanupOldAcks()

                    val pending = _pendingKitchenAck.value
                    if (pending != null && pending.orderId == it.orderId) {
                        // Order was acknowledged, clear pending state
                        kitchenAckTimeoutJob?.cancel()
                        _pendingKitchenAck.value = null
                        _showKitchenRetryDialog.value = false
                        android.util.Log.d("WaiterViewModel", "Kitchen acknowledgment cleared for order: ${it.orderNumber}")
                    } else {
                        android.util.Log.d("WaiterViewModel", "Ack cached for order ${it.orderId} (no pending state yet)")
                    }
                }
            }
        }

        // Start server discovery - same as kitchen app
        android.util.Log.d("WaiterViewModel", "========== CALLING discoverAndConnect() FROM INIT ==========")
        discoverAndConnect()
    }

    fun discoverAndConnect() {
        android.util.Log.d("WaiterViewModel", "========== discoverAndConnect() CALLED ==========")
        viewModelScope.launch {
            android.util.Log.d("WaiterViewModel", "Setting UI state to DiscoveringServer")
            _uiState.value = UiState.DiscoveringServer

            android.util.Log.d("WaiterViewModel", "Starting server discovery...")
            val ip = serverDiscovery.discoverServer()
            android.util.Log.d("WaiterViewModel", "Server discovery returned: $ip")

            if (ip != null) {
                android.util.Log.d("WaiterViewModel", "Server found at $ip, creating API service and connecting WebSocket")
                serverIp = ip
                apiService = PosApiService(ip)
                webSocketManager.connect(ip)
                android.util.Log.d("WaiterViewModel", "WebSocket connect() called, waiting for connection state change...")
            } else {
                android.util.Log.d("WaiterViewModel", "No server found, setting UI state to Error")
                _uiState.value = UiState.Error("No se encontró el servidor POS en la red local")
                android.util.Log.d("WaiterViewModel", "UI state set to Error, should show manual connection screen")
            }
        }
    }

    fun connectWithManualIp(ip: String) {
        android.util.Log.d("WaiterViewModel", "========== connectWithManualIp($ip) CALLED ==========")
        viewModelScope.launch {
            android.util.Log.d("WaiterViewModel", "Setting UI state to DiscoveringServer")
            _uiState.value = UiState.DiscoveringServer

            // Validate IP format
            val ipRegex = Regex("^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$")
            if (!ipRegex.matches(ip)) {
                android.util.Log.d("WaiterViewModel", "Invalid IP format: $ip")
                _uiState.value = UiState.Error("Formato de IP inválido. Usa formato: 192.168.1.100")
                return@launch
            }

            // Check if server exists at this IP
            android.util.Log.d("WaiterViewModel", "Checking server at $ip...")
            val serverExists = serverDiscovery.checkServer(ip)
            android.util.Log.d("WaiterViewModel", "Server check result: $serverExists")

            if (serverExists) {
                android.util.Log.d("WaiterViewModel", "Server found at $ip, creating API service and connecting WebSocket")
                serverIp = ip
                apiService = PosApiService(ip)
                webSocketManager.connect(ip)
                android.util.Log.d("WaiterViewModel", "WebSocket connect() called, waiting for connection state change...")
            } else {
                android.util.Log.d("WaiterViewModel", "Server not found at $ip, setting UI state to Error")
                _uiState.value = UiState.Error("No se pudo conectar al servidor en $ip. Verifica que el servidor esté ejecutándose y que la IP sea correcta.")
            }
        }
    }

    private fun loadInitialData() {
        viewModelScope.launch {
            android.util.Log.d("WaiterViewModel", "loadInitialData: Starting to load data")
            android.util.Log.d("WaiterViewModel", "loadInitialData: apiService is ${if (apiService != null) "not null" else "NULL"}")
            android.util.Log.d("WaiterViewModel", "loadInitialData: serverIp = $serverIp")

            _uiState.value = UiState.LoadingData

            if (apiService == null) {
                android.util.Log.e("WaiterViewModel", "loadInitialData: apiService is NULL, cannot load products")
                _uiState.value = UiState.Error("Servicio API no inicializado")
                return@launch
            }

            // Load cached data first for instant UI (cache-first strategy)
            val cachedProducts = preferences.getCachedProducts()
            val cachedTables = preferences.getCachedTables()

            if (cachedProducts != null) {
                android.util.Log.d("WaiterViewModel", "loadInitialData: Using ${cachedProducts.size} cached products")
                _products.value = cachedProducts.filter { it.available }
            }

            if (cachedTables != null) {
                android.util.Log.d("WaiterViewModel", "loadInitialData: Using ${cachedTables.size} cached tables")
                _tables.value = cachedTables
            }

            // If we have cache, show UI immediately
            if (cachedProducts != null && cachedTables != null) {
                _uiState.value = UiState.Ready
                loadOrders()
            }

            // Load fresh data from API in background
            android.util.Log.d("WaiterViewModel", "loadInitialData: Fetching fresh data from API")
            val productsResult = apiService?.getProducts()
            android.util.Log.d("WaiterViewModel", "loadInitialData: getProducts() returned: $productsResult")

            productsResult?.onSuccess { productList ->
                android.util.Log.d("WaiterViewModel", "loadInitialData: Received ${productList.size} fresh products from API")
                val available = productList.filter { it.available }
                _products.value = available
                // Cache for next time
                preferences.cacheProducts(available)
                android.util.Log.d("WaiterViewModel", "loadInitialData: Cached ${available.size} products")
            }?.onFailure { error ->
                android.util.Log.e("WaiterViewModel", "loadInitialData: Error loading products from API: ${error.message}", error)
                // If no cache, show error. If we have cache, continue silently
                if (cachedProducts == null) {
                    _uiState.value = UiState.Error(error.message ?: "Error cargando productos")
                    return@launch
                }
            }

            // Load fresh tables
            android.util.Log.d("WaiterViewModel", "loadInitialData: Calling getTables()")
            val tablesResult = apiService?.getTables()
            android.util.Log.d("WaiterViewModel", "loadInitialData: getTables() returned: $tablesResult")

            tablesResult?.onSuccess { tableList ->
                android.util.Log.d("WaiterViewModel", "loadInitialData: Received ${tableList.size} fresh tables from API")
                _tables.value = tableList
                // Cache for next time
                preferences.cacheTables(tableList)
                android.util.Log.d("WaiterViewModel", "loadInitialData: Cached ${tableList.size} tables")
            }?.onFailure { error ->
                android.util.Log.e("WaiterViewModel", "loadInitialData: Error loading tables from API: ${error.message}", error)
                // If no cache, show error. If we have cache, continue silently
                if (cachedTables == null) {
                    _uiState.value = UiState.Error(error.message ?: "Error cargando mesas")
                    return@launch
                }
            }

            // Load order types
            android.util.Log.d("WaiterViewModel", "loadInitialData: Calling getOrderTypes()")
            val orderTypesResult = apiService?.getOrderTypes()
            android.util.Log.d("WaiterViewModel", "loadInitialData: getOrderTypes() returned: $orderTypesResult")

            orderTypesResult?.onSuccess { orderTypeList ->
                android.util.Log.d("WaiterViewModel", "loadInitialData: Received ${orderTypeList.size} order types from API")
                _orderTypes.value = orderTypeList
                // Set first order type as default if none selected
                if (_selectedOrderType.value == null && orderTypeList.isNotEmpty()) {
                    _selectedOrderType.value = orderTypeList.first()
                    android.util.Log.d("WaiterViewModel", "loadInitialData: Set default order type to ${orderTypeList.first().name}")
                }
            }?.onFailure { error ->
                android.util.Log.e("WaiterViewModel", "loadInitialData: Error loading order types from API: ${error.message}", error)
                // Continue without order types - fallback to old behavior
            }

            // Load table areas
            android.util.Log.d("WaiterViewModel", "loadInitialData: Calling getTableAreas()")
            val tableAreasResult = apiService?.getTableAreas()
            android.util.Log.d("WaiterViewModel", "loadInitialData: getTableAreas() returned: $tableAreasResult")

            tableAreasResult?.onSuccess { areaList ->
                android.util.Log.d("WaiterViewModel", "loadInitialData: Received ${areaList.size} table areas from API")
                _tableAreas.value = areaList.filter { it.isActive }
            }?.onFailure { error ->
                android.util.Log.e("WaiterViewModel", "loadInitialData: Error loading table areas from API: ${error.message}", error)
                // Continue without areas - backwards compatibility
            }

            // Load custom pages
            android.util.Log.d("WaiterViewModel", "loadInitialData: Calling getCustomPages()")
            val customPagesResult = apiService?.getCustomPages()
            android.util.Log.d("WaiterViewModel", "loadInitialData: getCustomPages() returned: $customPagesResult")

            customPagesResult?.onSuccess { pageList ->
                android.util.Log.d("WaiterViewModel", "loadInitialData: Received ${pageList.size} custom pages from API")
                _customPages.value = pageList
            }?.onFailure { error ->
                android.util.Log.e("WaiterViewModel", "loadInitialData: Error loading custom pages from API: ${error.message}", error)
                // Continue without custom pages - fallback to categories
            }

            // Load mobile app configuration (for kitchen ack setting)
            android.util.Log.d("WaiterViewModel", "loadInitialData: Calling getMobileConfig()")
            val mobileConfigResult = apiService?.getMobileConfig()
            mobileConfigResult?.onSuccess { config ->
                android.util.Log.d("WaiterViewModel", "loadInitialData: Mobile config loaded, kitchen_ack=${config.enable_kitchen_ack}")
                kitchenAckEnabled = config.enable_kitchen_ack
            }?.onFailure { error ->
                android.util.Log.e("WaiterViewModel", "loadInitialData: Error loading mobile config: ${error.message}", error)
                // Kitchen ack remains disabled (default) on error
            }

            // Load pending orders
            if (_uiState.value != UiState.Ready) {
                android.util.Log.d("WaiterViewModel", "loadInitialData: Loading orders")
                loadOrders()
                _uiState.value = UiState.Ready
            }

            android.util.Log.d("WaiterViewModel", "loadInitialData: Finished loading data")
        }
    }

    fun loadOrders(status: String? = "pending", tableId: Int? = null) {
        viewModelScope.launch {
            apiService?.getOrders(status, tableId)?.onSuccess { orderList ->
                _orders.value = orderList
            }?.onFailure { error ->
                _uiState.value = UiState.Error(error.message ?: "Error cargando órdenes")
            }
        }
    }

    /**
     * Refresh all data from the server (tables, products, areas, etc.)
     * Called when user taps the sync button
     */
    fun refreshData() {
        viewModelScope.launch {
            android.util.Log.d("WaiterViewModel", "refreshData: Manual refresh triggered")

            // Clear cache to force fresh data
            preferences.clearCache()

            // Reload all data
            loadInitialData()
            updateTableTotals() // NEW: Update table totals
        }
    }

    /**
     * NEW: Calculate totals for all occupied tables
     * Called when orders are refreshed via WebSocket or manually
     */
    private fun updateTableTotals() {
        viewModelScope.launch {
            apiService?.getOrders(status = "pending")?.onSuccess { orders ->
                // Group orders by table and sum totals
                val totalsMap = orders
                    .filter { it.tableId != null } // Only table orders
                    .groupBy { it.tableId!! }
                    .mapValues { (_, ordersForTable) ->
                        ordersForTable.sumOf { it.total }
                    }
                _tableTotals.value = totalsMap
                android.util.Log.d("WaiterViewModel", "Updated table totals: $totalsMap")
            }?.onFailure { error ->
                android.util.Log.e("WaiterViewModel", "Error updating table totals: ${error.message}")
            }
        }
    }

    fun selectTable(table: Table) {
        viewModelScope.launch {
            _selectedTable.value = table
            _cart.value = emptyList()
            _currentOrderId.value = null

            android.util.Log.d("WaiterViewModel", "selectTable: Table ${table.number}, status=${table.status}")

            // If table is occupied, try to load existing pending order
            if (table.status == "occupied") {
                android.util.Log.d("WaiterViewModel", "Table is occupied, loading existing orders for table ${table.id}")
                apiService?.getOrders(status = "pending", tableId = table.id)?.onSuccess { orders ->
                    android.util.Log.d("WaiterViewModel", "Received ${orders.size} pending orders for table ${table.id}")
                    if (orders.isNotEmpty()) {
                        // Load the first pending order into cart for editing
                        val existingOrder = orders.first()
                        android.util.Log.d("WaiterViewModel", "Loading order ${existingOrder.orderNumber} (ID: ${existingOrder.id}) with ${existingOrder.items.size} items")
                        _currentOrderId.value = existingOrder.id

                        // Convert order items to cart items
                        val cartItems = existingOrder.items.mapNotNull { orderItem ->
                            // Find the product from our products list
                            _products.value.find { it.id == orderItem.productId }?.let { product ->
                                // Convert order item modifiers to cart modifiers
                                val modifiers = orderItem.modifiers?.mapNotNull { orderModifier ->
                                    if (orderModifier.modifier != null) {
                                        android.util.Log.d("WaiterViewModel", "Modifier found: ${orderModifier.modifier.name}")
                                        orderModifier.modifier
                                    } else {
                                        android.util.Log.w("WaiterViewModel", "Modifier is null for modifierId: ${orderModifier.modifierId}")
                                        null
                                    }
                                } ?: emptyList()

                                CartItem(
                                    product = product,
                                    quantity = orderItem.quantity,
                                    notes = orderItem.notes ?: "",
                                    modifiers = modifiers,
                                    customPrice = if (product.hasVariablePrice) orderItem.unitPrice else null
                                )
                            }
                        }
                        android.util.Log.d("WaiterViewModel", "Loaded ${cartItems.size} items into cart")
                        _cart.value = cartItems
                    } else {
                        android.util.Log.d("WaiterViewModel", "No pending orders found for occupied table")
                    }
                }?.onFailure { error ->
                    android.util.Log.e("WaiterViewModel", "Error loading orders: ${error.message}")
                }
            } else {
                android.util.Log.d("WaiterViewModel", "Table is available, starting new order")
            }

            // Set order type to dine-in when selecting a table
            // Look for order type with code "dine-in" or "para-comer-aqui"
            val dineInType = _orderTypes.value.find {
                it.code == "dine-in" || it.code == "dine_in" || it.code == "para-comer-aqui" || it.code == "para_comer_aqui"
            }
            _selectedOrderType.value = dineInType
            android.util.Log.d("WaiterViewModel", "selectTable: Set order type to ${dineInType?.name ?: "null"} (code: ${dineInType?.code})")

            navigateToScreen(Screen.ProductSelection)
        }
    }

    fun releaseTable() {
        viewModelScope.launch {
            // Navigate first to avoid intermediate re-render with null table (which shows as takeout)
            navigateToScreen(Screen.TableSelection)
            // Then clear state
            _selectedTable.value = null
            _cart.value = emptyList()
            _currentOrderId.value = null
            // Refresh tables to get updated status
            apiService?.getTables()?.onSuccess { tableList ->
                _tables.value = tableList
            }
        }
    }

    fun changeTable(newTable: Table) {
        viewModelScope.launch {
            val oldTable = _selectedTable.value
            android.util.Log.d("WaiterViewModel", "Changing table from ${oldTable?.number} to ${newTable.number}")

            // Update the selected table
            _selectedTable.value = newTable

            // If there's an existing order, update it on the server with the new table
            val currentOrderId = _currentOrderId.value
            if (currentOrderId != null && _cart.value.isNotEmpty()) {
                android.util.Log.d("WaiterViewModel", "Updating existing order ${currentOrderId} with new table")

                val selectedType = _selectedOrderType.value
                val orderType = selectedType?.code ?: "dine_in"

                val items = _cart.value.map { cartItem ->
                    OrderItemRequest(
                        productId = cartItem.product.id,
                        quantity = cartItem.quantity,
                        unitPrice = cartItem.unitPrice,
                        subtotal = cartItem.subtotal,
                        notes = cartItem.notes.takeIf { it.isNotBlank() },
                        modifiers = cartItem.modifiers.takeIf { it.isNotEmpty() }?.map { modifier ->
                            OrderItemModifierRequest(
                                modifierId = modifier.id,
                                priceChange = modifier.priceChange
                            )
                        }
                    )
                }

                val orderNumber = _orders.value.find { it.id == currentOrderId }?.orderNumber ?: "W-${System.currentTimeMillis()}"

                val order = OrderRequest(
                    orderNumber = orderNumber,
                    orderTypeId = selectedType?.id,
                    type = orderType,
                    tableId = newTable.id,
                    items = items,
                    subtotal = cartTotal,
                    tax = 0.0,
                    total = cartTotal,
                    source = "waiter_app"
                )

                apiService?.updateOrder(currentOrderId, order)?.onSuccess {
                    android.util.Log.d("WaiterViewModel", "Order updated successfully with new table")

                    // Update table statuses
                    if (oldTable != null) {
                        // Mark old table as available
                        apiService?.updateTableStatus(oldTable.id, "available")
                    }
                    // Mark new table as occupied
                    apiService?.updateTableStatus(newTable.id, "occupied")

                    // Refresh tables to get updated status
                    apiService?.getTables()?.onSuccess { tableList ->
                        _tables.value = tableList
                    }
                }?.onFailure { error ->
                    android.util.Log.e("WaiterViewModel", "Error updating order with new table: ${error.message}")
                    // Revert table change on error
                    _selectedTable.value = oldTable
                }
            } else {
                // No existing order, just refresh tables
                apiService?.getTables()?.onSuccess { tableList ->
                    _tables.value = tableList
                }
            }
        }
    }

    fun navigateToScreen(screen: Screen) {
        _currentScreen.value = screen
    }

    fun startTakeoutOrder() {
        _selectedTable.value = null
        _cart.value = emptyList()
        _deliveryInfo.value = null

        // Set order type to takeout
        // Look for order type with code "takeout" or "para-llevar"
        val takeoutType = _orderTypes.value.find {
            it.code == "takeout" || it.code == "para-llevar" || it.code == "take-out" || it.code == "take_out"
        }
        _selectedOrderType.value = takeoutType
        android.util.Log.d("WaiterViewModel", "startTakeoutOrder: Set order type to ${takeoutType?.name ?: "null"} (code: ${takeoutType?.code})")

        navigateToScreen(Screen.ProductSelection)
    }

    fun startDeliveryOrder() {
        _selectedTable.value = null
        // DON'T clear cart - keep existing products if any
        // Reset delivery info to allow entering new data (will be set after dialog confirmation)
        _deliveryInfo.value = null

        // Set order type to delivery
        // Look for order type with code "delivery" or "domicilio"
        val deliveryType = _orderTypes.value.find {
            it.code == "delivery" || it.code == "domicilio"
        }
        _selectedOrderType.value = deliveryType
        android.util.Log.d("WaiterViewModel", "startDeliveryOrder: Set order type to ${deliveryType?.name ?: "null"} (code: ${deliveryType?.code}), cart has ${_cart.value.size} items")

        // Don't navigate here - navigation happens after delivery info dialog is confirmed
    }

    fun setDeliveryInfo(info: com.drewcore.waiter_app.ui.components.DeliveryInfo) {
        _deliveryInfo.value = info
        android.util.Log.d("WaiterViewModel", "setDeliveryInfo: name=${info.customerName}, address=${info.address}, phone=${info.phone}")
    }

    fun addToCart(product: Product, modifiers: List<Modifier> = emptyList(), notes: String = "", customPrice: Double? = null) {
        val currentCart = _cart.value.toMutableList()
        // Items should only stack if they have the same product, modifiers, notes, AND custom price
        val existingIndex = currentCart.indexOfFirst {
            it.product.id == product.id &&
            it.modifiers == modifiers &&
            it.notes == notes &&
            it.customPrice == customPrice
        }

        if (existingIndex != -1) {
            // Same product with same modifiers, notes, and custom price - increase quantity
            currentCart[existingIndex] = currentCart[existingIndex].copy(quantity = currentCart[existingIndex].quantity + 1)
        } else {
            // New item or different modifiers/notes/price - add as new cart item
            currentCart.add(CartItem(
                product = product,
                quantity = 1,
                modifiers = modifiers,
                notes = notes,
                customPrice = customPrice
            ))
        }

        _cart.value = currentCart
    }

    fun removeFromCart(cartItem: CartItem) {
        val currentCart = _cart.value.toMutableList()
        currentCart.remove(cartItem)
        _cart.value = currentCart
    }

    fun updateQuantity(cartItem: CartItem, quantity: Int) {
        if (quantity <= 0) {
            removeFromCart(cartItem)
            return
        }

        val currentCart = _cart.value.toMutableList()
        // Find the exact cart item by product, modifiers, AND notes
        val index = currentCart.indexOfFirst {
            it.product.id == cartItem.product.id &&
            it.modifiers == cartItem.modifiers &&
            it.notes == cartItem.notes
        }
        if (index != -1) {
            currentCart[index] = currentCart[index].copy(quantity = quantity)
            _cart.value = currentCart
        }
    }

    fun updateNotes(cartItem: CartItem, notes: String) {
        val currentCart = _cart.value.toMutableList()
        // Find the exact cart item by product, modifiers, AND notes
        val index = currentCart.indexOfFirst {
            it.product.id == cartItem.product.id &&
            it.modifiers == cartItem.modifiers &&
            it.notes == cartItem.notes
        }
        if (index != -1) {
            currentCart[index] = currentCart[index].copy(notes = notes)
            _cart.value = currentCart
        }
    }

    fun selectCategory(category: String?) {
        _selectedCategory.value = category
        // Clear custom page selection when category is selected
        _selectedCustomPage.value = null
        _customPageProducts.value = emptyList()
    }

    fun selectCustomPage(page: CustomPage?) {
        viewModelScope.launch {
            _selectedCustomPage.value = page
            // Clear category selection when custom page is selected
            _selectedCategory.value = null

            if (page != null) {
                android.util.Log.d("WaiterViewModel", "Loading products for custom page: ${page.name}")
                apiService?.getCustomPageProducts(page.id)?.onSuccess { products ->
                    android.util.Log.d("WaiterViewModel", "Received ${products.size} products for page ${page.name}")
                    _customPageProducts.value = products.filter { it.available }
                }?.onFailure { error ->
                    android.util.Log.e("WaiterViewModel", "Error loading custom page products: ${error.message}")
                    _customPageProducts.value = emptyList()
                }
            } else {
                _customPageProducts.value = emptyList()
            }
        }
    }

    fun selectOrderType(orderType: OrderType) {
        _selectedOrderType.value = orderType
        android.util.Log.d("WaiterViewModel", "Selected order type: ${orderType.name} (id: ${orderType.id}, code: ${orderType.code})")
    }

    fun sendOrder() {
        if (_cart.value.isEmpty()) {
            _uiState.value = UiState.Error("El carrito está vacío")
            return
        }

        val table = _selectedTable.value
        val selectedType = _selectedOrderType.value

        // Fallback to deprecated type detection if no order type selected
        // Convert code with hyphens (dine-in) to underscores (dine_in) for backward compatibility
        val orderType = selectedType?.code?.replace("-", "_") ?: (if (table != null) "dine_in" else "takeout")

        viewModelScope.launch {
            _uiState.value = UiState.SendingOrder

            val orderNumber = _currentOrderId.value?.let { orderId ->
                // If we have a current order ID, we're updating, keep the same number
                _orders.value.find { it.id == orderId }?.orderNumber ?: generateOrderNumber()
            } ?: generateOrderNumber()

            val items = _cart.value.map { cartItem ->
                OrderItemRequest(
                    productId = cartItem.product.id,
                    quantity = cartItem.quantity,
                    unitPrice = cartItem.unitPrice,
                    subtotal = cartItem.subtotal,
                    notes = cartItem.notes.takeIf { it.isNotBlank() },
                    modifiers = cartItem.modifiers.takeIf { it.isNotEmpty() }?.map { modifier ->
                        OrderItemModifierRequest(
                            modifierId = modifier.id,
                            priceChange = modifier.priceChange
                        )
                    }
                )
            }

            // Include delivery info if it exists (regardless of order type code)
            val deliveryData = _deliveryInfo.value
            android.util.Log.d("WaiterViewModel", "sendOrder: deliveryData=$deliveryData, selectedType=${selectedType?.code}")

            val order = OrderRequest(
                orderNumber = orderNumber,
                orderTypeId = selectedType?.id, // Use order_type_id (new field)
                type = orderType, // Keep deprecated field for backward compatibility
                tableId = table?.id,
                items = items,
                subtotal = cartTotal,
                tax = 0.0,
                total = cartTotal,
                source = "waiter_app",
                deliveryCustomerName = deliveryData?.customerName,
                deliveryAddress = deliveryData?.address,
                deliveryPhone = deliveryData?.phone
            )

            android.util.Log.d("WaiterViewModel", "sendOrder: Sending order with delivery info: name='${order.deliveryCustomerName}', address='${order.deliveryAddress}', phone='${order.deliveryPhone}'")

            // Update existing order or create new one
            val currentOrderId = _currentOrderId.value
            val result = if (currentOrderId != null) {
                apiService?.updateOrder(currentOrderId, order)
            } else {
                apiService?.createOrder(order)
            }

            result?.onSuccess { orderResponse ->
                // Backend REST handler will broadcast to kitchen via WebSocket
                // No need to send WebSocket message here - REST handlers handle it

                // Only track kitchen acknowledgment for NEW orders (not updates)
                // and only if kitchen ack feature is enabled
                val isNewOrder = currentOrderId == null
                if (isNewOrder && kitchenAckEnabled) {
                    // Check if we already received an ack (race condition - ack arrived before this code ran)
                    val alreadyAcked = recentAcks.containsKey(orderResponse.order_id)
                    if (alreadyAcked) {
                        android.util.Log.d("WaiterViewModel", "Order ${orderResponse.order_number} already acked (from cache)")
                        recentAcks.remove(orderResponse.order_id)
                    } else {
                        // Start kitchen acknowledgment tracking
                        android.util.Log.d("WaiterViewModel", "Starting kitchen ack tracking for order: ${orderResponse.order_number}")
                        _pendingKitchenAck.value = PendingKitchenAck(
                            orderId = orderResponse.order_id,
                            orderNumber = orderResponse.order_number
                        )
                        startKitchenAckTimeout(orderResponse.order_id, orderResponse.order_number)
                    }
                }

                // Navigate FIRST to avoid UI flash with null table on ProductSelection screen
                navigateToScreen(Screen.TableSelection)

                // Then clear cart and order state
                _cart.value = emptyList()
                _currentOrderId.value = null
                _selectedTable.value = null

                // Show success state briefly (UI will show toast/snackbar)
                _uiState.value = UiState.OrderSent(orderNumber)

                // Refresh tables to get updated status
                apiService?.getTables()?.onSuccess { tableList ->
                    _tables.value = tableList
                }

                // Reload orders
                loadOrders()

                // Reset to Ready after a short delay (for UI to show success message)
                delay(1500)
                _uiState.value = UiState.Ready
            }?.onFailure { error ->
                _uiState.value = UiState.Error(error.message ?: "Error enviando pedido")
            }
        }
    }

    /**
     * Send split bill orders - creates multiple separate orders from one cart
     * Each map entry represents one bill with its assigned items
     */
    fun sendSplitBillOrders(splitOrders: Map<Int, List<CartItem>>) {
        if (splitOrders.isEmpty() || splitOrders.values.all { it.isEmpty() }) {
            _uiState.value = UiState.Error("No hay items asignados a las cuentas")
            return
        }

        val table = _selectedTable.value
        val selectedType = _selectedOrderType.value
        val orderType = selectedType?.code?.replace("-", "_") ?: (if (table != null) "dine_in" else "takeout")

        viewModelScope.launch {
            _uiState.value = UiState.SendingOrder

            var allSuccess = true
            var lastOrderNumber = ""
            val sentOrderNumbers = mutableListOf<String>()

            // Create one order for each bill
            splitOrders.entries.sortedBy { it.key }.forEach { (billNum, cartItems) ->
                if (cartItems.isEmpty()) return@forEach

                // Generate unique order number for each split
                val baseOrderNumber = generateOrderNumber()
                val orderNumber = "$baseOrderNumber-${billNum}"
                lastOrderNumber = orderNumber

                val items = cartItems.map { cartItem ->
                    OrderItemRequest(
                        productId = cartItem.product.id,
                        quantity = cartItem.quantity,
                        unitPrice = cartItem.unitPrice,
                        subtotal = cartItem.subtotal,
                        notes = cartItem.notes.takeIf { it.isNotBlank() },
                        modifiers = cartItem.modifiers.takeIf { it.isNotEmpty() }?.map { modifier ->
                            OrderItemModifierRequest(
                                modifierId = modifier.id,
                                priceChange = modifier.priceChange
                            )
                        }
                    )
                }

                val billTotal = cartItems.sumOf { it.subtotal }
                val deliveryData = _deliveryInfo.value

                val order = OrderRequest(
                    orderNumber = orderNumber,
                    orderTypeId = selectedType?.id,
                    type = orderType,
                    tableId = table?.id,
                    items = items,
                    subtotal = billTotal,
                    tax = 0.0,
                    total = billTotal,
                    notes = "Cuenta dividida ${billNum}/${splitOrders.size}",
                    source = "waiter_app",
                    deliveryCustomerName = deliveryData?.customerName,
                    deliveryAddress = deliveryData?.address,
                    deliveryPhone = deliveryData?.phone
                )

                android.util.Log.d("WaiterViewModel", "sendSplitBill: Sending bill $billNum with total $billTotal")

                val result = apiService?.createOrder(order)
                result?.onSuccess { orderResponse ->
                    sentOrderNumbers.add(orderNumber)
                    android.util.Log.d("WaiterViewModel", "sendSplitBill: Bill $billNum sent successfully")
                }?.onFailure { error ->
                    android.util.Log.e("WaiterViewModel", "sendSplitBill: Failed to send bill $billNum", error)
                    allSuccess = false
                    _uiState.value = UiState.Error("Error enviando cuenta $billNum: ${error.message}")
                    return@launch // Stop sending remaining bills if one fails
                }
            }

            if (allSuccess && sentOrderNumbers.isNotEmpty()) {
                // Navigate first
                navigateToScreen(Screen.TableSelection)

                // Clear cart and order state
                _cart.value = emptyList()
                _currentOrderId.value = null
                _selectedTable.value = null

                // Show success state
                _uiState.value = UiState.OrderSent("Cuentas divididas enviadas (${sentOrderNumbers.size})")

                // Refresh tables and orders
                apiService?.getTables()?.onSuccess { tableList ->
                    _tables.value = tableList
                }
                loadOrders()

                // Reset to Ready after delay
                delay(1500)
                _uiState.value = UiState.Ready
            }
        }
    }

    fun deleteCurrentOrder() {
        val orderId = _currentOrderId.value ?: return

        viewModelScope.launch {
            apiService?.deleteOrder(orderId)?.onSuccess {
                // Clear cart and order ID
                _cart.value = emptyList()
                _currentOrderId.value = null

                // Refresh tables to get updated status
                apiService?.getTables()?.onSuccess { tableList ->
                    _tables.value = tableList
                }

                // Reload orders
                loadOrders()

                // Go back to table selection
                releaseTable()
            }?.onFailure { error ->
                _uiState.value = UiState.Error(error.message ?: "Error eliminando pedido")
            }
        }
    }

    /**
     * Request print receipt via main app's configured printer
     * Sends current cart data to main app via WebSocket
     */
    fun printCurrentReceipt() {
        if (_cart.value.isEmpty()) {
            _uiState.value = UiState.Error("No hay items para imprimir")
            return
        }

        val table = _selectedTable.value
        val selectedType = _selectedOrderType.value

        // Prepare order data for printing
        val orderData = mapOf(
            "table_number" to (table?.number ?: "Para Llevar"),
            "order_type" to (selectedType?.name ?: "Para Llevar"),
            "items" to _cart.value.map { cartItem ->
                mapOf(
                    "name" to cartItem.product.name,
                    "quantity" to cartItem.quantity,
                    "unit_price" to cartItem.unitPrice,
                    "subtotal" to cartItem.subtotal,
                    "notes" to cartItem.notes,
                    "modifiers" to cartItem.modifiers.map { modifier ->
                        mapOf(
                            "name" to modifier.name,
                            "price_change" to modifier.priceChange
                        )
                    }
                )
            },
            "subtotal" to cartTotal,
            "tax" to 0.0,
            "total" to cartTotal,
            "timestamp" to System.currentTimeMillis()
        )

        // Generate temporary order number for printing
        val tempOrderNumber = "PREVIEW-${System.currentTimeMillis()}"

        // Send print request via WebSocket
        webSocketManager.sendPrintRequest(tempOrderNumber, orderData)

        android.util.Log.d("WaiterViewModel", "Print request sent for preview receipt")
        _uiState.value = UiState.Ready
    }

    fun clearError() {
        if (_uiState.value is UiState.Error) {
            _uiState.value = UiState.Ready
        }
    }

    // Refresh functions for real-time updates via WebSocket
    private fun refreshTables() {
        viewModelScope.launch {
            apiService?.getTables()?.onSuccess { tableList ->
                android.util.Log.d("WaiterViewModel", "Tables refreshed: ${tableList.size} tables")
                _tables.value = tableList
                // Update cache
                preferences.cacheTables(tableList)

                // If we have a selected table, update it with the new data
                _selectedTable.value?.let { currentTable ->
                    val updatedTable = tableList.find { it.id == currentTable.id }
                    if (updatedTable != null) {
                        _selectedTable.value = updatedTable
                        android.util.Log.d("WaiterViewModel", "Updated selected table ${updatedTable.number}, status=${updatedTable.status}")
                    }
                }
            }?.onFailure { error ->
                android.util.Log.e("WaiterViewModel", "Error refreshing tables: ${error.message}")
            }
        }
    }

    private fun refreshProducts() {
        viewModelScope.launch {
            apiService?.getProducts()?.onSuccess { productList ->
                android.util.Log.d("WaiterViewModel", "Products refreshed: ${productList.size} products")
                val available = productList.filter { it.available }
                _products.value = available
                // Update cache
                preferences.cacheProducts(available)
            }?.onFailure { error ->
                android.util.Log.e("WaiterViewModel", "Error refreshing products: ${error.message}")
            }
        }
    }

    private fun refreshOrders() {
        viewModelScope.launch {
            // Reload pending orders
            loadOrders()

            // If we're currently editing an order, reload it
            _currentOrderId.value?.let { orderId ->
                apiService?.getOrders(status = "pending", tableId = _selectedTable.value?.id)?.onSuccess { orders ->
                    val currentOrder = orders.find { it.id == orderId }
                    if (currentOrder == null) {
                        // Order was deleted or completed, clear cart
                        android.util.Log.d("WaiterViewModel", "Current order no longer exists, clearing cart")
                        _cart.value = emptyList()
                        _currentOrderId.value = null
                    }
                }
            }
        }
    }

    private fun generateOrderNumber(): String {
        orderCounter++
        val timestamp = SimpleDateFormat("yyMMddHHmm", Locale.getDefault()).format(Date())
        return "W$timestamp-${orderCounter.toString().padStart(3, '0')}"
    }

    // Load an order from orders list into cart for editing
    fun loadOrderToCart(order: OrderResponse) {
        viewModelScope.launch {
            android.util.Log.d("WaiterViewModel", "Loading order ${order.orderNumber} (ID: ${order.id}) into cart")

            // Set the table if the order has one
            if (order.tableId != null) {
                val table = _tables.value.find { it.id == order.tableId }
                _selectedTable.value = table
            } else {
                _selectedTable.value = null
            }

            // Set the current order ID
            _currentOrderId.value = order.id

            // Convert order items to cart items
            val cartItems = order.items.mapNotNull { orderItem ->
                // Find the product from our products list
                _products.value.find { it.id == orderItem.productId }?.let { product ->
                    // Convert order item modifiers to cart modifiers
                    val modifiers = orderItem.modifiers?.mapNotNull { orderModifier ->
                        if (orderModifier.modifier != null) {
                            android.util.Log.d("WaiterViewModel", "Modifier found: ${orderModifier.modifier.name}")
                            orderModifier.modifier
                        } else {
                            android.util.Log.w("WaiterViewModel", "Modifier is null for modifierId: ${orderModifier.modifierId}")
                            null
                        }
                    } ?: emptyList()

                    android.util.Log.d("WaiterViewModel", "CartItem for product ${product.name}: ${modifiers.size} modifiers")

                    CartItem(
                        product = product,
                        quantity = orderItem.quantity,
                        notes = orderItem.notes ?: "",
                        modifiers = modifiers
                    )
                }
            }

            android.util.Log.d("WaiterViewModel", "Loaded ${cartItems.size} items into cart with modifiers")
            _cart.value = cartItems

            // Navigate to product selection screen (where cart is visible)
            navigateToScreen(Screen.ProductSelection)
        }
    }

    // Delete a specific order by ID
    fun deleteOrder(orderId: Int, onSuccess: () -> Unit = {}, onError: (String) -> Unit = {}) {
        viewModelScope.launch {
            android.util.Log.d("WaiterViewModel", "Deleting order ID: $orderId")

            apiService?.deleteOrder(orderId)?.onSuccess {
                android.util.Log.d("WaiterViewModel", "Order deleted successfully")

                // Refresh orders list
                loadOrders()

                // Refresh tables to get updated status
                apiService?.getTables()?.onSuccess { tableList ->
                    _tables.value = tableList
                }

                onSuccess()
            }?.onFailure { error ->
                android.util.Log.e("WaiterViewModel", "Error deleting order: ${error.message}")
                onError(error.message ?: "Error eliminando pedido")
            }
        }
    }

    /**
     * Mark order as ready (sends WebSocket message to update status)
     */
    fun markOrderAsReady(orderId: Int, onSuccess: () -> Unit = {}, onError: (String) -> Unit = {}) {
        viewModelScope.launch {
            android.util.Log.d("WaiterViewModel", "Marking order as ready: $orderId")

            try {
                // Send WebSocket message to update order status to "ready"
                webSocketManager.sendOrderStatusUpdate(orderId, "ready")

                // Refresh orders list to reflect changes
                loadOrders()

                android.util.Log.d("WaiterViewModel", "Order marked as ready successfully: $orderId")
                onSuccess()
            } catch (e: Exception) {
                android.util.Log.e("WaiterViewModel", "Error marking order as ready: ${e.message}")
                onError(e.message ?: "Error marcando pedido como listo")
            }
        }
    }

    /**
     * Check if WebSocket is currently connected
     */
    fun isConnected(): Boolean {
        return webSocketManager.isConnected()
    }

    /**
     * Quickly reconnect to a known server address (used when app resumes)
     */
    fun quickReconnect(address: String, isTunnel: Boolean, isSecure: Boolean) {
        android.util.Log.d("WaiterViewModel", "quickReconnect called: $address (tunnel: $isTunnel)")

        // Don't reconnect if already connected
        if (webSocketManager.isConnected()) {
            android.util.Log.d("WaiterViewModel", "Already connected, skipping quick reconnect")
            return
        }

        viewModelScope.launch {
            _uiState.value = UiState.DiscoveringServer

            // Create connection and try to connect
            val connection = ServerConnection(address, isTunnel, isSecure)
            serverIp = address
            apiService = PosApiService(address)
            webSocketManager.connect(connection)

            android.util.Log.d("WaiterViewModel", "Quick reconnect initiated to $address")
        }
    }

    // Kitchen acknowledgment functions

    /**
     * Clean up old acks from cache to prevent memory leaks
     */
    private fun cleanupOldAcks() {
        val now = System.currentTimeMillis()
        val keysToRemove = recentAcks.filter { (_, timestamp) ->
            now - timestamp > ACK_CACHE_EXPIRY_MS
        }.keys
        keysToRemove.forEach { recentAcks.remove(it) }
        if (keysToRemove.isNotEmpty()) {
            android.util.Log.d("WaiterViewModel", "Cleaned up ${keysToRemove.size} old acks from cache")
        }
    }

    private fun startKitchenAckTimeout(orderId: Int, orderNumber: String) {
        // Cancel any existing timeout
        kitchenAckTimeoutJob?.cancel()

        kitchenAckTimeoutJob = viewModelScope.launch {
            delay(KITCHEN_ACK_TIMEOUT_MS)

            // Check if still pending (not yet acknowledged)
            val pending = _pendingKitchenAck.value
            if (pending != null && pending.orderId == orderId) {
                android.util.Log.w("WaiterViewModel", "Kitchen acknowledgment timeout for order: $orderNumber")
                _showKitchenRetryDialog.value = true
            }
        }
    }

    /**
     * Dismiss the kitchen retry dialog
     */
    fun dismissKitchenRetryDialog() {
        _showKitchenRetryDialog.value = false
        _pendingKitchenAck.value = null
        kitchenAckTimeoutJob?.cancel()
    }

    /**
     * Retry sending order to kitchen
     */
    fun retryKitchenSend() {
        val pending = _pendingKitchenAck.value ?: return

        viewModelScope.launch {
            android.util.Log.d("WaiterViewModel", "Retrying kitchen send for order: ${pending.orderNumber}")
            _showKitchenRetryDialog.value = false

            // Call the API to resend to kitchen
            apiService?.sendToKitchen(pending.orderId)?.onSuccess {
                android.util.Log.d("WaiterViewModel", "Order resent to kitchen: ${pending.orderNumber}")
                // Restart the timeout
                startKitchenAckTimeout(pending.orderId, pending.orderNumber)
            }?.onFailure { error ->
                android.util.Log.e("WaiterViewModel", "Error resending to kitchen: ${error.message}")
                _uiState.value = UiState.Error("Error reenviando a cocina: ${error.message}")
                _pendingKitchenAck.value = null
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        kitchenAckTimeoutJob?.cancel()
        webSocketManager.cleanup()
    }
}
