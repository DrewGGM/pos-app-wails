package com.drewcore.waiter_app

import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.drewcore.waiter_app.ui.screens.CartScreen
import com.drewcore.waiter_app.ui.screens.ProductsScreen
import com.drewcore.waiter_app.ui.screens.TableSelectionScreen
import com.drewcore.waiter_app.ui.screens.OrdersListScreen
import com.drewcore.waiter_app.ui.screens.SettingsScreen
import com.drewcore.waiter_app.ui.theme.WaiterappTheme
import com.drewcore.waiter_app.ui.viewmodel.WaiterViewModel
import com.drewcore.waiter_app.update.UpdateManager
import com.drewcore.waiter_app.update.UpdateInfo
import com.drewcore.waiter_app.data.preferences.WaiterPreferences

class MainActivity : ComponentActivity() {
    private val viewModel: WaiterViewModel by viewModels()
    private lateinit var updateManager: UpdateManager
    private lateinit var preferences: WaiterPreferences
    private var updateInfo by mutableStateOf<UpdateInfo?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Initialize preferences
        preferences = WaiterPreferences(this)

        // Initialize update manager and check for updates
        updateManager = UpdateManager(this)
        checkForUpdates()

        setContent {
            WaiterappTheme {
                WaiterApp(
                    viewModel = viewModel,
                    preferences = preferences,
                    updateInfo = updateInfo,
                    onUpdateAccepted = { info ->
                        updateManager.downloadUpdate(info)
                        Toast.makeText(this, "Descargando actualización...", Toast.LENGTH_LONG).show()
                        updateInfo = null
                    },
                    onUpdateDismissed = {
                        updateInfo = null
                    }
                )
            }
        }
    }

    private fun checkForUpdates() {
        lifecycleScope.launch {
            try {
                val info = updateManager.checkForUpdates()
                if (info != null) {
                    updateInfo = info
                }
            } catch (e: Exception) {
                Log.e("MainActivity", "Error checking updates", e)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        updateManager.cleanup()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WaiterApp(
    viewModel: WaiterViewModel,
    preferences: WaiterPreferences,
    updateInfo: UpdateInfo? = null,
    onUpdateAccepted: (UpdateInfo) -> Unit = {},
    onUpdateDismissed: () -> Unit = {}
) {
    var gridColumns by remember { mutableStateOf(preferences.gridColumns) }
    val uiState by viewModel.uiState.collectAsState()
    val currentScreen by viewModel.currentScreen.collectAsState()
    val products by viewModel.products.collectAsState()
    val tables by viewModel.tables.collectAsState()
    val selectedTable by viewModel.selectedTable.collectAsState()
    val orders by viewModel.orders.collectAsState()
    val cart by viewModel.cart.collectAsState()
    val selectedCategory by viewModel.selectedCategory.collectAsState()
    val currentOrderId by viewModel.currentOrderId.collectAsState()

    var selectedTab by remember { mutableStateOf(0) }
    var showSuccessSnackbar by remember { mutableStateOf(false) }
    var successMessage by remember { mutableStateOf("") }

    val snackbarHostState = remember { SnackbarHostState() }

    // Show update dialog if available
    if (updateInfo != null) {
        UpdateAvailableDialog(
            updateInfo = updateInfo,
            onAccept = { onUpdateAccepted(updateInfo) },
            onDismiss = onUpdateDismissed
        )
    }

    LaunchedEffect(uiState) {
        when (val state = uiState) {
            is WaiterViewModel.UiState.OrderSent -> {
                successMessage = "Pedido #${state.orderNumber} enviado a cocina"
                showSuccessSnackbar = true
                selectedTab = 0 // Switch back to products
            }
            is WaiterViewModel.UiState.Error -> {
                snackbarHostState.showSnackbar(
                    message = state.message,
                    duration = SnackbarDuration.Long
                )
                viewModel.clearError()
            }
            else -> {}
        }
    }

    LaunchedEffect(showSuccessSnackbar) {
        if (showSuccessSnackbar) {
            snackbarHostState.showSnackbar(
                message = successMessage,
                duration = SnackbarDuration.Short
            )
            showSuccessSnackbar = false
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            when (uiState) {
                is WaiterViewModel.UiState.Loading,
                is WaiterViewModel.UiState.DiscoveringServer -> {
                    LoadingScreen(message = "Buscando servidor POS...")
                }
                is WaiterViewModel.UiState.LoadingData -> {
                    LoadingScreen(message = "Cargando datos...")
                }
                is WaiterViewModel.UiState.SendingOrder -> {
                    LoadingScreen(message = "Enviando pedido...")
                }
                is WaiterViewModel.UiState.Ready,
                is WaiterViewModel.UiState.OrderSent -> {
                    when (currentScreen) {
                        is WaiterViewModel.Screen.TableSelection -> {
                            TableSelectionScreen(
                                tables = tables,
                                onTableSelected = { table ->
                                    viewModel.selectTable(table)
                                },
                                onViewOrders = {
                                    viewModel.navigateToScreen(WaiterViewModel.Screen.OrdersList)
                                },
                                onCreateTakeoutOrder = {
                                    viewModel.startTakeoutOrder()
                                }
                            )
                        }
                        is WaiterViewModel.Screen.ProductSelection -> {
                            ProductSelectionWithCart(
                                products = products,
                                categories = viewModel.categories,
                                selectedCategory = selectedCategory,
                                selectedTable = selectedTable,
                                cart = cart,
                                cartTotal = viewModel.cartTotal,
                                cartItemCount = viewModel.cartItemCount,
                                isEditingOrder = currentOrderId != null,
                                onCategorySelected = { viewModel.selectCategory(it) },
                                onAddToCart = { product, modifiers, notes -> viewModel.addToCart(product, modifiers, notes) },
                                onUpdateQuantity = { item, qty -> viewModel.updateQuantity(item, qty) },
                                onUpdateNotes = { item, notes -> viewModel.updateNotes(item, notes) },
                                onRemoveItem = { viewModel.removeFromCart(it) },
                                onSendOrder = { viewModel.sendOrder() },
                                onCancelOrder = if (currentOrderId != null) { { viewModel.deleteCurrentOrder() } } else null,
                                onReleaseTable = { viewModel.releaseTable() },
                                selectedTab = selectedTab,
                                onTabSelected = { selectedTab = it },
                                availableTables = viewModel.getTablesForSwitching(selectedTable?.id),
                                onChangeTable = { table -> viewModel.changeTable(table) },
                                gridColumns = gridColumns,
                                onOpenSettings = { viewModel.navigateToScreen(WaiterViewModel.Screen.Settings) }
                            )
                        }
                        is WaiterViewModel.Screen.OrdersList -> {
                            OrdersListScreen(
                                orders = orders,
                                onBack = {
                                    viewModel.navigateToScreen(WaiterViewModel.Screen.TableSelection)
                                },
                                onRefresh = {
                                    viewModel.loadOrders()
                                }
                            )
                        }
                        is WaiterViewModel.Screen.Settings -> {
                            SettingsScreen(
                                preferences = preferences,
                                onBack = {
                                    // Reload grid columns after settings change
                                    gridColumns = preferences.gridColumns
                                    viewModel.navigateToScreen(WaiterViewModel.Screen.TableSelection)
                                }
                            )
                        }
                    }
                }
                is WaiterViewModel.UiState.Error -> {
                    ErrorScreen(
                        message = (uiState as WaiterViewModel.UiState.Error).message,
                        onRetry = { viewModel.discoverAndConnect() },
                        onManualConnect = { ip -> viewModel.connectWithManualIp(ip) }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductSelectionWithCart(
    products: List<com.drewcore.waiter_app.data.models.Product>,
    categories: List<String>,
    selectedCategory: String?,
    selectedTable: com.drewcore.waiter_app.data.models.Table?,
    cart: List<com.drewcore.waiter_app.data.models.CartItem>,
    cartTotal: Double,
    cartItemCount: Int,
    isEditingOrder: Boolean = false,
    onCategorySelected: (String?) -> Unit,
    onAddToCart: (com.drewcore.waiter_app.data.models.Product, List<com.drewcore.waiter_app.data.models.Modifier>, String) -> Unit,
    onUpdateQuantity: (com.drewcore.waiter_app.data.models.CartItem, Int) -> Unit,
    onUpdateNotes: (com.drewcore.waiter_app.data.models.CartItem, String) -> Unit,
    onRemoveItem: (com.drewcore.waiter_app.data.models.CartItem) -> Unit,
    onSendOrder: () -> Unit,
    onCancelOrder: (() -> Unit)? = null,
    onReleaseTable: () -> Unit,
    selectedTab: Int,
    onTabSelected: (Int) -> Unit,
    availableTables: List<com.drewcore.waiter_app.data.models.Table>,
    onChangeTable: (com.drewcore.waiter_app.data.models.Table) -> Unit,
    gridColumns: Int = 2,
    onOpenSettings: () -> Unit = {}
) {
    var showChangeTableDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = if (selectedTab == 0) "Productos" else "Carrito",
                            fontWeight = FontWeight.Bold
                        )
                        if (selectedTable != null) {
                            Text(
                                text = "Mesa: ${selectedTable.number}",
                                style = MaterialTheme.typography.bodySmall
                            )
                        } else {
                            Text(
                                text = "PARA LLEVAR",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.secondary
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onReleaseTable) {
                        Icon(Icons.Default.ArrowBack, if (selectedTable != null) "Liberar mesa y volver" else "Volver")
                    }
                },
                actions = {
                    if (selectedTable != null && cart.isNotEmpty()) {
                        IconButton(onClick = { showChangeTableDialog = true }) {
                            Icon(Icons.Default.Edit, "Cambiar mesa")
                        }
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Default.Settings, "Configuración")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    icon = { Icon(Icons.Default.List, contentDescription = null) },
                    label = { Text("Productos") },
                    selected = selectedTab == 0,
                    onClick = { onTabSelected(0) }
                )
                NavigationBarItem(
                    icon = {
                        BadgedBox(
                            badge = {
                                if (cart.isNotEmpty()) {
                                    Badge { Text(cartItemCount.toString()) }
                                }
                            }
                        ) {
                            Icon(Icons.Default.ShoppingCart, contentDescription = null)
                        }
                    },
                    label = { Text("Carrito") },
                    selected = selectedTab == 1,
                    onClick = { onTabSelected(1) }
                )
            }
        }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            when (selectedTab) {
                0 -> ProductsScreen(
                    products = products,
                    categories = categories,
                    selectedCategory = selectedCategory,
                    onCategorySelected = onCategorySelected,
                    onAddToCart = onAddToCart,
                    gridColumns = gridColumns
                )
                1 -> CartScreen(
                    cartItems = cart,
                    cartTotal = cartTotal,
                    selectedTable = selectedTable,
                    isEditingOrder = isEditingOrder,
                    onUpdateQuantity = onUpdateQuantity,
                    onUpdateNotes = onUpdateNotes,
                    onRemoveItem = onRemoveItem,
                    onSendOrder = onSendOrder,
                    onCancelOrder = onCancelOrder
                )
            }
        }
    }

    // Change table dialog
    if (showChangeTableDialog) {
        ChangeTableDialog(
            availableTables = availableTables,
            currentTable = selectedTable,
            onDismiss = { showChangeTableDialog = false },
            onTableSelected = { table ->
                onChangeTable(table)
                showChangeTableDialog = false
            }
        )
    }
}

@Composable
fun ChangeTableDialog(
    availableTables: List<com.drewcore.waiter_app.data.models.Table>,
    currentTable: com.drewcore.waiter_app.data.models.Table?,
    onDismiss: () -> Unit,
    onTableSelected: (com.drewcore.waiter_app.data.models.Table) -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cambiar Mesa") },
        text = {
            Column {
                if (currentTable != null) {
                    Text(
                        text = "Mesa actual: ${currentTable.number}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }
                Text(
                    text = "Selecciona una mesa disponible:",
                    style = MaterialTheme.typography.bodyMedium
                )
                Spacer(modifier = Modifier.height(16.dp))

                if (availableTables.isEmpty()) {
                    Text(
                        text = "No hay mesas disponibles",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                } else {
                    LazyColumn(modifier = Modifier.heightIn(max = 300.dp)) {
                        items(availableTables) { table ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .clickable { onTableSelected(table) }
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column {
                                        Text(
                                            text = "Mesa ${table.number}",
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold
                                        )
                                        if (table.name.isNotEmpty()) {
                                            Text(
                                                text = table.name,
                                                style = MaterialTheme.typography.bodySmall
                                            )
                                        }
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(
                                            imageVector = Icons.Default.Person,
                                            contentDescription = null,
                                            modifier = Modifier.size(16.dp)
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text(
                                            text = "${table.capacity}",
                                            style = MaterialTheme.typography.bodyMedium
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        }
    )
}

@Composable
fun LoadingScreen(message: String) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.titleMedium
            )
        }
    }
}

@Composable
fun ErrorScreen(
    message: String,
    onRetry: () -> Unit,
    onManualConnect: (String) -> Unit = {}
) {
    var showManualConfig by remember { mutableStateOf(false) }
    var manualIp by remember { mutableStateOf("") }
    var isConnecting by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(32.dp)
        ) {
            Icon(
                Icons.Default.Warning,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.error
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "Error de Conexión",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(24.dp))
            Button(
                onClick = onRetry,
                modifier = Modifier.fillMaxWidth(0.8f)
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Buscar Automáticamente")
            }
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedButton(
                onClick = { showManualConfig = true },
                modifier = Modifier.fillMaxWidth(0.8f)
            ) {
                Icon(Icons.Default.Settings, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Configurar IP Manualmente")
            }
        }
    }

    // Manual IP Configuration Dialog
    if (showManualConfig) {
        AlertDialog(
            onDismissRequest = { showManualConfig = false },
            icon = {
                Icon(Icons.Default.Settings, contentDescription = null)
            },
            title = {
                Text("Configuración del Servidor")
            },
            text = {
                Column {
                    Text(
                        text = "Ingresa la dirección IP del servidor POS:",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    TextField(
                        value = manualIp,
                        onValueChange = { manualIp = it },
                        label = { Text("IP del Servidor") },
                        placeholder = { Text("Ej: 192.168.1.100") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Asegúrate de que el servidor POS esté ejecutándose en la red local.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (manualIp.isNotBlank()) {
                            isConnecting = true
                            showManualConfig = false
                            onManualConnect(manualIp.trim())
                        }
                    },
                    enabled = manualIp.isNotBlank()
                ) {
                    Text("Conectar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showManualConfig = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
}

@Composable
fun UpdateAvailableDialog(
    updateInfo: UpdateInfo,
    onAccept: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = {
            Icon(
                Icons.Default.Info,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary
            )
        },
        title = {
            Text("Actualización Disponible")
        },
        text = {
            Column {
                Text(
                    text = "Nueva versión ${updateInfo.version} disponible",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = updateInfo.releaseNotes,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        },
        confirmButton = {
            Button(onClick = onAccept) {
                Text("Actualizar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Después")
            }
        }
    )
}
