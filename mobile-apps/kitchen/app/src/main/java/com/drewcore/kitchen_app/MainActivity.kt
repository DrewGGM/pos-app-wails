package com.drewcore.kitchen_app

import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drewcore.kitchen_app.data.network.ServerDiscovery
import com.drewcore.kitchen_app.data.preferences.KitchenPreferences
import com.drewcore.kitchen_app.ui.screens.ActiveOrdersScreen
import com.drewcore.kitchen_app.ui.screens.HistoryScreen
import com.drewcore.kitchen_app.ui.screens.SettingsScreen
import com.drewcore.kitchen_app.ui.theme.KitchenappTheme
import com.drewcore.kitchen_app.ui.viewmodel.KitchenViewModel
import com.drewcore.kitchen_app.update.UpdateManager
import com.drewcore.kitchen_app.update.UpdateInfo

class MainActivity : ComponentActivity() {
    private val viewModel: KitchenViewModel by viewModels()
    private lateinit var updateManager: UpdateManager
    private var updateInfo by mutableStateOf<UpdateInfo?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Initialize update manager and check for updates
        updateManager = UpdateManager(this)
        checkForUpdates()

        setContent {
            KitchenappTheme {
                KitchenApp(
                    viewModel = viewModel,
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
fun KitchenApp(
    viewModel: KitchenViewModel,
    updateInfo: UpdateInfo? = null,
    onUpdateAccepted: (UpdateInfo) -> Unit = {},
    onUpdateDismissed: () -> Unit = {}
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val preferences = remember { KitchenPreferences(context) }
    val serverDiscovery = remember { ServerDiscovery(context) }

    val uiState by viewModel.uiState.collectAsState()
    val activeOrders by viewModel.activeOrders.collectAsState()
    val completedOrders by viewModel.completedOrders.collectAsState()
    val soundEnabled by viewModel.soundEnabled.collectAsState()
    val updatedOrderIds by viewModel.updatedOrderIds.collectAsState()

    var showHistory by remember { mutableStateOf(false) }
    var showSettings by remember { mutableStateOf(false) }

    // Show update dialog if available
    if (updateInfo != null) {
        UpdateAvailableDialog(
            updateInfo = updateInfo,
            onAccept = { onUpdateAccepted(updateInfo) },
            onDismiss = onUpdateDismissed
        )
    }

    // If showing settings, display settings screen
    if (showSettings) {
        SettingsScreen(
            preferences = preferences,
            serverDiscovery = serverDiscovery,
            onBack = { showSettings = false }
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = if (showHistory) "Historial" else "Órdenes Activas",
                            fontWeight = FontWeight.Bold
                        )
                        // Badge con contador
                        if (!showHistory && activeOrders.isNotEmpty()) {
                            Badge(
                                containerColor = MaterialTheme.colorScheme.error
                            ) {
                                Text(activeOrders.size.toString())
                            }
                        } else if (showHistory && completedOrders.isNotEmpty()) {
                            Badge(
                                containerColor = MaterialTheme.colorScheme.tertiary
                            ) {
                                Text(completedOrders.size.toString())
                            }
                        }
                    }
                },
                actions = {
                    // History toggle button
                    IconButton(onClick = { showHistory = !showHistory }) {
                        BadgedBox(
                            badge = {
                                if (showHistory && activeOrders.isNotEmpty()) {
                                    Badge { Text(activeOrders.size.toString()) }
                                } else if (!showHistory && completedOrders.isNotEmpty()) {
                                    Badge { Text(completedOrders.size.toString()) }
                                }
                            }
                        ) {
                            Icon(
                                if (showHistory) Icons.Default.List else Icons.Default.Done,
                                contentDescription = if (showHistory) "Ver activas" else "Ver historial"
                            )
                        }
                    }

                    // Connection status indicator
                    when (uiState) {
                        is KitchenViewModel.UiState.Connected -> {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = "Conectado",
                                tint = Color(0xFF4CAF50),
                                modifier = Modifier.padding(horizontal = 4.dp)
                            )
                        }
                        is KitchenViewModel.UiState.Error -> {
                            Icon(
                                Icons.Default.Warning,
                                contentDescription = "Error",
                                tint = Color(0xFFF44336),
                                modifier = Modifier.padding(horizontal = 4.dp)
                            )
                        }
                        else -> {
                            CircularProgressIndicator(
                                modifier = Modifier
                                    .size(20.dp)
                                    .padding(horizontal = 4.dp)
                            )
                        }
                    }

                    // Sound toggle
                    IconButton(onClick = { viewModel.toggleSound() }) {
                        Icon(
                            if (soundEnabled) Icons.Default.Notifications else Icons.Default.NotificationsOff,
                            contentDescription = if (soundEnabled) "Silenciar" else "Activar sonido"
                        )
                    }

                    // Settings button
                    IconButton(onClick = { showSettings = true }) {
                        Icon(
                            Icons.Default.Settings,
                            contentDescription = "Configuración"
                        )
                    }

                    // Refresh connection
                    IconButton(onClick = { viewModel.discoverAndConnect() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Reconectar")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        }
    ) { innerPadding ->
        Box(modifier = Modifier.padding(innerPadding)) {
            when (uiState) {
                is KitchenViewModel.UiState.Loading,
                is KitchenViewModel.UiState.DiscoveringServer -> {
                    LoadingScreen(message = "Buscando servidor POS...")
                }
                is KitchenViewModel.UiState.Connecting -> {
                    LoadingScreen(message = "Conectando...")
                }
                is KitchenViewModel.UiState.Connected -> {
                    if (showHistory) {
                        HistoryScreen(
                            completedOrders = completedOrders,
                            onRemove = { viewModel.removeFromHistory(it) },
                            onUndo = { viewModel.undoCompletion(it) }
                        )
                    } else {
                        ActiveOrdersScreen(
                            orderStates = activeOrders,
                            updatedOrderIds = updatedOrderIds,
                            preferences = preferences,
                            onMarkAsReady = { viewModel.markOrderAsReady(it) },
                            onRemoveCancelled = { viewModel.manuallyRemoveCancelledOrder(it) }
                        )
                    }
                }
                is KitchenViewModel.UiState.Error -> {
                    ErrorScreen(
                        message = (uiState as KitchenViewModel.UiState.Error).message,
                        onRetry = { viewModel.discoverAndConnect() },
                        onManualConnect = { ip -> viewModel.connectWithManualIp(ip) }
                    )
                }
            }
        }
    }
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