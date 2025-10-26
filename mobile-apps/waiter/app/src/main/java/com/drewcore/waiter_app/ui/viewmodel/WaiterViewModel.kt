package com.drewcore.waiter_app.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.drewcore.waiter_app.data.models.*
import com.drewcore.waiter_app.data.network.PosApiService
import com.drewcore.waiter_app.data.network.ServerDiscovery
import com.drewcore.waiter_app.data.network.WebSocketManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class WaiterViewModel(application: Application) : AndroidViewModel(application) {
    private val serverDiscovery = ServerDiscovery(application.applicationContext)
    private val webSocketManager = WebSocketManager()

    private val _uiState = MutableStateFlow<UiState>(UiState.Loading)
    val uiState: StateFlow<UiState> = _uiState

    private val _products = MutableStateFlow<List<Product>>(emptyList())
    val products: StateFlow<List<Product>> = _products

    private val _tables = MutableStateFlow<List<Table>>(emptyList())
    val tables: StateFlow<List<Table>> = _tables

    private val _selectedTable = MutableStateFlow<Table?>(null)
    val selectedTable: StateFlow<Table?> = _selectedTable

    private val _orders = MutableStateFlow<List<OrderResponse>>(emptyList())
    val orders: StateFlow<List<OrderResponse>> = _orders

    private val _cart = MutableStateFlow<List<CartItem>>(emptyList())
    val cart: StateFlow<List<CartItem>> = _cart

    private val _selectedCategory = MutableStateFlow<String?>(null)
    val selectedCategory: StateFlow<String?> = _selectedCategory

    private val _currentScreen = MutableStateFlow<Screen>(Screen.TableSelection)
    val currentScreen: StateFlow<Screen> = _currentScreen

    private val _currentOrderId = MutableStateFlow<Int?>(null)
    val currentOrderId: StateFlow<Int?> = _currentOrderId

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
    }

    val cartTotal: Double
        get() = _cart.value.sumOf { it.subtotal }

    val cartItemCount: Int
        get() = _cart.value.sumOf { it.quantity }

    val categories: List<String>
        get() = _products.value.mapNotNull { it.category }.distinct().sorted()

    val availableTables: List<Table>
        get() = _tables.value.filter { it.status == "available" }

    init {
        viewModelScope.launch {
            webSocketManager.connectionState.collect { state ->
                when (state) {
                    is WebSocketManager.ConnectionState.Connected -> {
                        if (_uiState.value != UiState.Ready &&
                            _uiState.value !is UiState.SendingOrder &&
                            _uiState.value !is UiState.OrderSent) {
                            loadInitialData()
                        }
                    }
                    is WebSocketManager.ConnectionState.Error -> {
                        if (_uiState.value == UiState.DiscoveringServer || _uiState.value == UiState.LoadingData) {
                            _uiState.value = UiState.Error(state.message)
                        }
                    }
                    is WebSocketManager.ConnectionState.Disconnected -> {
                        // If was previously connected, try to reconnect
                        if (_uiState.value == UiState.Ready) {
                            _uiState.value = UiState.Error("Desconectado del servidor. Intenta reconectar.")
                        }
                    }
                    else -> {}
                }
            }
        }

        discoverAndConnect()
    }

    fun discoverAndConnect() {
        viewModelScope.launch {
            _uiState.value = UiState.DiscoveringServer

            val ip = serverDiscovery.discoverServer()
            if (ip != null) {
                serverIp = ip
                apiService = PosApiService(ip)
                webSocketManager.connect(ip)

                // WebSocket listener in init{} will call loadInitialData() when Connected
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
                apiService = PosApiService(ip)
                webSocketManager.connect(ip)

                // WebSocket listener in init{} will call loadInitialData() when Connected
            } else {
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

            // Load products
            if (apiService == null) {
                android.util.Log.e("WaiterViewModel", "loadInitialData: apiService is NULL, cannot load products")
                _uiState.value = UiState.Error("Servicio API no inicializado")
                return@launch
            }

            android.util.Log.d("WaiterViewModel", "loadInitialData: Calling getProducts()")
            val productsResult = apiService?.getProducts()
            android.util.Log.d("WaiterViewModel", "loadInitialData: getProducts() returned: $productsResult")

            productsResult?.onSuccess { productList ->
                android.util.Log.d("WaiterViewModel", "loadInitialData: Received ${productList.size} products")
                val available = productList.filter { it.available }
                android.util.Log.d("WaiterViewModel", "loadInitialData: ${available.size} products are available")
                _products.value = available
            }?.onFailure { error ->
                android.util.Log.e("WaiterViewModel", "loadInitialData: Error loading products: ${error.message}", error)
                _uiState.value = UiState.Error(error.message ?: "Error cargando productos")
                return@launch
            }

            // Load tables
            android.util.Log.d("WaiterViewModel", "loadInitialData: Calling getTables()")
            val tablesResult = apiService?.getTables()
            android.util.Log.d("WaiterViewModel", "loadInitialData: getTables() returned: $tablesResult")

            tablesResult?.onSuccess { tableList ->
                android.util.Log.d("WaiterViewModel", "loadInitialData: Received ${tableList.size} tables")
                _tables.value = tableList
            }?.onFailure { error ->
                android.util.Log.e("WaiterViewModel", "loadInitialData: Error loading tables: ${error.message}", error)
                _uiState.value = UiState.Error(error.message ?: "Error cargando mesas")
                return@launch
            }

            // Load only pending orders for waiter app
            android.util.Log.d("WaiterViewModel", "loadInitialData: Loading orders")
            loadOrders()

            android.util.Log.d("WaiterViewModel", "loadInitialData: Finished loading data, setting state to Ready")
            _uiState.value = UiState.Ready
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
                                CartItem(
                                    product = product,
                                    quantity = orderItem.quantity,
                                    notes = orderItem.notes ?: ""
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

            navigateToScreen(Screen.ProductSelection)
        }
    }

    fun releaseTable() {
        viewModelScope.launch {
            _selectedTable.value = null
            _cart.value = emptyList()
            _currentOrderId.value = null
            // Refresh tables to get updated status
            apiService?.getTables()?.onSuccess { tableList ->
                _tables.value = tableList
            }
            navigateToScreen(Screen.TableSelection)
        }
    }

    fun changeTable(newTable: Table) {
        viewModelScope.launch {
            android.util.Log.d("WaiterViewModel", "Changing table from ${_selectedTable.value?.number} to ${newTable.number}")
            _selectedTable.value = newTable
            // Refresh tables to get updated status
            apiService?.getTables()?.onSuccess { tableList ->
                _tables.value = tableList
            }
        }
    }

    fun navigateToScreen(screen: Screen) {
        _currentScreen.value = screen
    }

    fun startTakeoutOrder() {
        _selectedTable.value = null
        _cart.value = emptyList()
        navigateToScreen(Screen.ProductSelection)
    }

    fun addToCart(product: Product) {
        val currentCart = _cart.value.toMutableList()
        val existing = currentCart.find { it.product.id == product.id }

        if (existing != null) {
            existing.quantity++
        } else {
            currentCart.add(CartItem(product = product, quantity = 1))
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
        val index = currentCart.indexOf(cartItem)
        if (index != -1) {
            currentCart[index].quantity = quantity
            _cart.value = currentCart
        }
    }

    fun updateNotes(cartItem: CartItem, notes: String) {
        val currentCart = _cart.value.toMutableList()
        val index = currentCart.indexOf(cartItem)
        if (index != -1) {
            currentCart[index].notes = notes
            _cart.value = currentCart
        }
    }

    fun selectCategory(category: String?) {
        _selectedCategory.value = category
    }

    fun sendOrder() {
        if (_cart.value.isEmpty()) return

        val table = _selectedTable.value
        // Automatically detect order type based on whether a table is selected
        val orderType = if (table != null) "dine_in" else "takeout"

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
                    price = cartItem.product.price,
                    subtotal = cartItem.subtotal,
                    notes = cartItem.notes.takeIf { it.isNotBlank() }
                )
            }

            val order = OrderRequest(
                orderNumber = orderNumber,
                type = orderType,
                tableId = table?.id,
                items = items,
                subtotal = cartTotal,
                tax = 0.0,
                total = cartTotal,
                source = "waiter_app"
            )

            // Update existing order or create new one
            val currentOrderId = _currentOrderId.value
            val result = if (currentOrderId != null) {
                apiService?.updateOrder(currentOrderId, order)
            } else {
                apiService?.createOrder(order)
            }

            result?.onSuccess {
                // Send via WebSocket for real-time notification
                webSocketManager.sendNewOrder(order)

                // Clear cart and order ID
                _cart.value = emptyList()
                _currentOrderId.value = null
                _selectedTable.value = null
                _uiState.value = UiState.OrderSent(orderNumber)

                // Refresh tables to get updated status
                apiService?.getTables()?.onSuccess { tableList ->
                    _tables.value = tableList
                }

                // Reload orders
                loadOrders()

                // Wait 2 seconds to show success message, then navigate back to table selection
                kotlinx.coroutines.delay(2000)
                _uiState.value = UiState.Ready
                navigateToScreen(Screen.TableSelection)
            }?.onFailure { error ->
                _uiState.value = UiState.Error(error.message ?: "Error enviando pedido")
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

    fun clearError() {
        if (_uiState.value is UiState.Error) {
            _uiState.value = UiState.Ready
        }
    }

    private fun generateOrderNumber(): String {
        orderCounter++
        val timestamp = SimpleDateFormat("yyMMddHHmm", Locale.getDefault()).format(Date())
        return "W$timestamp-${orderCounter.toString().padStart(3, '0')}"
    }

    override fun onCleared() {
        super.onCleared()
        webSocketManager.disconnect()
    }
}
