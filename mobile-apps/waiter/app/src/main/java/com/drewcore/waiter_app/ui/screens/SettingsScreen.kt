package com.drewcore.waiter_app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.SyncDisabled
import androidx.compose.material.icons.filled.TableBar
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import com.drewcore.waiter_app.data.models.Table
import com.drewcore.waiter_app.data.models.TableArea
import com.drewcore.waiter_app.data.models.TableGridLayout
import com.drewcore.waiter_app.data.network.ServerDiscovery
import com.drewcore.waiter_app.data.preferences.WaiterPreferences
import kotlinx.coroutines.launch

// Tunnel test status sealed class
sealed class TunnelTestStatus {
    object Idle : TunnelTestStatus()
    object Testing : TunnelTestStatus()
    object Success : TunnelTestStatus()
    data class Failed(val message: String) : TunnelTestStatus()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    preferences: WaiterPreferences,
    tables: List<Table> = emptyList(),
    tableAreas: List<TableArea> = emptyList(),
    serverDiscovery: ServerDiscovery? = null,
    isConnected: Boolean = false,
    onStartBackgroundService: () -> Unit = {},
    onStopBackgroundService: () -> Unit = {},
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var gridColumns by remember { mutableStateOf(preferences.gridColumns.toFloat()) }
    var showTableLayoutDialog by remember { mutableStateOf(false) }

    // Area selection for grid layout editing
    var selectedAreaId by remember(tableAreas) {
        mutableStateOf(tableAreas.firstOrNull()?.id)
    }

    // Per-area grid layouts
    var areaGridLayouts by remember {
        mutableStateOf(preferences.getAllAreaGridLayouts())
    }

    // Tunnel settings
    var tunnelEnabled by remember { mutableStateOf(preferences.tunnelEnabled) }
    var tunnelUrl by remember { mutableStateOf(preferences.tunnelUrl ?: "") }
    var tunnelUseSecure by remember { mutableStateOf(preferences.tunnelUseSecure) }
    var tunnelTestStatus by remember { mutableStateOf<TunnelTestStatus>(TunnelTestStatus.Idle) }

    // Filter tables by selected area
    val filteredTables = remember(tables, selectedAreaId) {
        if (selectedAreaId == null) {
            tables
        } else {
            tables.filter { it.areaId == selectedAreaId || it.area?.id == selectedAreaId }
        }
    }

    // Get current area's grid layout
    val currentGridLayout = remember(selectedAreaId, areaGridLayouts, filteredTables) {
        selectedAreaId?.let { areaId ->
            areaGridLayouts[areaId] ?: if (filteredTables.isNotEmpty()) {
                preferences.createDefaultGridLayout(filteredTables)
            } else {
                TableGridLayout()
            }
        } ?: TableGridLayout()
    }

    // Update layout when tables or area changes
    LaunchedEffect(filteredTables, selectedAreaId) {
        if (selectedAreaId != null && filteredTables.isNotEmpty() &&
            (areaGridLayouts[selectedAreaId]?.positions?.isEmpty() != false)) {
            val defaultLayout = preferences.createDefaultGridLayout(filteredTables)
            areaGridLayouts = areaGridLayouts + (selectedAreaId!! to defaultLayout)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Configuracion", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Volver")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // Products Section
            Text(
                text = "Productos",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )

            // Products Grid Columns
            SettingSlider(
                title = "Columnas de Productos",
                value = gridColumns,
                valueRange = 2f..4f,
                steps = 1,
                onValueChange = { gridColumns = it },
                valueLabel = "${gridColumns.toInt()} columnas"
            )

            HorizontalDivider()

            // Tables Section
            Text(
                text = "Distribucion de Mesas",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )

            // Area selector (only show if there are multiple areas)
            if (tableAreas.size > 1) {
                Text(
                    text = "Selecciona el area a configurar:",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    tableAreas.forEach { area ->
                        val areaColor = try {
                            Color(android.graphics.Color.parseColor(area.color))
                        } catch (e: Exception) {
                            MaterialTheme.colorScheme.primary
                        }

                        FilterChip(
                            selected = selectedAreaId == area.id,
                            onClick = { selectedAreaId = area.id },
                            label = { Text(area.name) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = areaColor,
                                selectedLabelColor = Color.White
                            )
                        )
                    }
                }
            }

            // Table Layout Button
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = selectedAreaId != null || tableAreas.isEmpty()) {
                        showTableLayoutDialog = true
                    },
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.GridView,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Column {
                            Text(
                                text = "Configurar Distribucion",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            val selectedArea = tableAreas.find { it.id == selectedAreaId }
                            Text(
                                text = if (selectedArea != null) {
                                    "Area: ${selectedArea.name} (${filteredTables.size} mesas)"
                                } else {
                                    "Organiza las mesas como en tu restaurante"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Icon(
                        Icons.Default.TableBar,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Grid preview
            if (currentGridLayout.positions.isNotEmpty()) {
                Text(
                    text = "Vista previa (${currentGridLayout.columns}x${currentGridLayout.rows})",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                GridPreview(
                    layout = currentGridLayout,
                    tables = filteredTables
                )
            }

            HorizontalDivider()

            // Tunnel Configuration Section
            Text(
                text = "Conexion Remota (Tunnel)",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )

            // Enable Tunnel Switch
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            if (tunnelEnabled) Icons.Default.Cloud else Icons.Default.CloudOff,
                            contentDescription = null,
                            tint = if (tunnelEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Column {
                            Text(
                                text = "Habilitar Tunnel",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = if (tunnelEnabled) "Conectar via Internet" else "Solo red local",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Switch(
                        checked = tunnelEnabled,
                        onCheckedChange = { tunnelEnabled = it }
                    )
                }
            }

            // Tunnel URL Input (only visible when enabled)
            if (tunnelEnabled) {
                OutlinedTextField(
                    value = tunnelUrl,
                    onValueChange = {
                        tunnelUrl = it
                        tunnelTestStatus = TunnelTestStatus.Idle
                    },
                    label = { Text("URL del Tunnel") },
                    placeholder = { Text("ejemplo.trycloudflare.com") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    supportingText = {
                        Text("Ingresa la URL del tunnel de Cloudflare sin protocolo")
                    }
                )

                // Use Secure WebSocket Switch
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "WebSocket Seguro (WSS)",
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = if (tunnelUseSecure) "Usando wss:// (recomendado)" else "Usando ws:// (no seguro)",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Switch(
                        checked = tunnelUseSecure,
                        onCheckedChange = { tunnelUseSecure = it }
                    )
                }

                // Test Connection Button
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedButton(
                        onClick = {
                            if (tunnelUrl.isNotBlank() && serverDiscovery != null) {
                                tunnelTestStatus = TunnelTestStatus.Testing
                                scope.launch {
                                    val isReachable = serverDiscovery.checkTunnelUrl(tunnelUrl)
                                    tunnelTestStatus = if (isReachable) {
                                        TunnelTestStatus.Success
                                    } else {
                                        TunnelTestStatus.Failed("No se pudo conectar al servidor")
                                    }
                                }
                            }
                        },
                        enabled = tunnelUrl.isNotBlank() && tunnelTestStatus !is TunnelTestStatus.Testing,
                        modifier = Modifier.weight(1f)
                    ) {
                        if (tunnelTestStatus is TunnelTestStatus.Testing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                        }
                        Text(if (tunnelTestStatus is TunnelTestStatus.Testing) "Probando..." else "Probar Conexion")
                    }

                    // Status indicator
                    when (tunnelTestStatus) {
                        is TunnelTestStatus.Success -> {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = "Exito",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                        is TunnelTestStatus.Failed -> {
                            Icon(
                                Icons.Default.Error,
                                contentDescription = "Error",
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                        else -> {}
                    }
                }

                // Error message
                if (tunnelTestStatus is TunnelTestStatus.Failed) {
                    Text(
                        text = (tunnelTestStatus as TunnelTestStatus.Failed).message,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }

            HorizontalDivider()

            // Background Connection Section
            Text(
                text = "Conexion en Segundo Plano",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )

            var backgroundConnectionEnabled by remember { mutableStateOf(preferences.backgroundConnectionEnabled) }
            var showPermissionDeniedMessage by remember { mutableStateOf(false) }

            // Permission launcher for POST_NOTIFICATIONS (Android 13+)
            val notificationPermissionLauncher = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.RequestPermission()
            ) { isGranted ->
                if (isGranted) {
                    // Permission granted, enable the feature and start service
                    backgroundConnectionEnabled = true
                    preferences.backgroundConnectionEnabled = true
                    if (isConnected) {
                        onStartBackgroundService()
                    }
                    showPermissionDeniedMessage = false
                } else {
                    // Permission denied, don't enable the feature
                    backgroundConnectionEnabled = false
                    preferences.backgroundConnectionEnabled = false
                    showPermissionDeniedMessage = true
                }
            }

            // Function to check and request notification permission
            fun enableBackgroundConnection() {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    // Android 13+ requires POST_NOTIFICATIONS permission
                    when {
                        ContextCompat.checkSelfPermission(
                            context,
                            Manifest.permission.POST_NOTIFICATIONS
                        ) == PackageManager.PERMISSION_GRANTED -> {
                            // Permission already granted
                            backgroundConnectionEnabled = true
                            preferences.backgroundConnectionEnabled = true
                            if (isConnected) {
                                onStartBackgroundService()
                            }
                        }
                        else -> {
                            // Request permission
                            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                    }
                } else {
                    // Android 12 and below don't need explicit notification permission
                    backgroundConnectionEnabled = true
                    preferences.backgroundConnectionEnabled = true
                    if (isConnected) {
                        onStartBackgroundService()
                    }
                }
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                if (backgroundConnectionEnabled) Icons.Default.Sync else Icons.Default.SyncDisabled,
                                contentDescription = null,
                                tint = if (backgroundConnectionEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Column {
                                Text(
                                    text = "Mantener Conexion Activa",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    text = if (backgroundConnectionEnabled && isConnected) {
                                        "Servicio activo"
                                    } else if (backgroundConnectionEnabled) {
                                        "Se activara al conectar"
                                    } else {
                                        "Evita reconexiones al volver a la app"
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (backgroundConnectionEnabled && isConnected) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        MaterialTheme.colorScheme.onSurfaceVariant
                                    }
                                )
                            }
                        }
                        Switch(
                            checked = backgroundConnectionEnabled,
                            onCheckedChange = { enabled ->
                                if (enabled) {
                                    enableBackgroundConnection()
                                } else {
                                    backgroundConnectionEnabled = false
                                    preferences.backgroundConnectionEnabled = false
                                    onStopBackgroundService()
                                    showPermissionDeniedMessage = false
                                }
                            }
                        )
                    }

                    // Permission denied warning
                    if (showPermissionDeniedMessage) {
                        Text(
                            text = "Se requiere permiso de notificaciones para mantener la conexion en segundo plano. Por favor, habilita las notificaciones en la configuracion del dispositivo.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }

                    Text(
                        text = "Cuando esta habilitado, la app mantiene la conexion con el servidor incluso cuando esta en segundo plano. Esto usa una pequena cantidad de bateria adicional pero permite respuesta instantanea al volver.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            HorizontalDivider()

            // Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Reset button
                OutlinedButton(
                    onClick = {
                        gridColumns = WaiterPreferences.DEFAULT_GRID_COLUMNS.toFloat()
                        backgroundConnectionEnabled = true
                        preferences.backgroundConnectionEnabled = true
                        // Reset layouts for all areas
                        val newLayouts = mutableMapOf<Int, TableGridLayout>()
                        tableAreas.forEach { area ->
                            val areaTables = tables.filter { it.areaId == area.id || it.area?.id == area.id }
                            if (areaTables.isNotEmpty()) {
                                newLayouts[area.id] = preferences.createDefaultGridLayout(areaTables)
                            }
                        }
                        areaGridLayouts = newLayouts
                        tunnelEnabled = false
                        tunnelUrl = ""
                        tunnelUseSecure = true
                        tunnelTestStatus = TunnelTestStatus.Idle
                        // Clear all saved layouts
                        tableAreas.forEach { area ->
                            preferences.clearTableGridLayoutForArea(area.id)
                        }
                        preferences.clearTableGridLayout() // Clear legacy layout too
                        preferences.resetToDefaults()
                        preferences.tunnelEnabled = false
                        preferences.tunnelUrl = null
                        preferences.tunnelUseSecure = true
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Restaurar")
                }

                // Save button
                Button(
                    onClick = {
                        preferences.gridColumns = gridColumns.toInt()
                        // Save all per-area layouts
                        areaGridLayouts.forEach { (areaId, layout) ->
                            preferences.setTableGridLayoutForArea(areaId, layout)
                        }
                        // Save tunnel settings
                        preferences.tunnelEnabled = tunnelEnabled
                        preferences.tunnelUrl = tunnelUrl.ifBlank { null }
                        preferences.tunnelUseSecure = tunnelUseSecure
                        onBack()
                    },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Guardar")
                }
            }

            // Info card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer
                )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        "Consejo",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "Configura la distribucion de las mesas para que coincida con tu restaurante. Toca una celda para agregar o quitar una mesa.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }

    // Table Layout Dialog
    if (showTableLayoutDialog && filteredTables.isNotEmpty() && selectedAreaId != null) {
        TableGridLayoutDialog(
            tables = filteredTables,
            initialLayout = currentGridLayout,
            onLayoutChanged = { newLayout ->
                // Update the layout for the selected area
                areaGridLayouts = areaGridLayouts + (selectedAreaId!! to newLayout)
            },
            onDismiss = { showTableLayoutDialog = false }
        )
    }
}

@Composable
fun GridPreview(
    layout: TableGridLayout,
    tables: List<Table>
) {
    val tableMap = remember(tables) { tables.associateBy { it.id } }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        for (row in 0 until layout.rows.coerceAtMost(4)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                for (col in 0 until layout.columns) {
                    val tableId = layout.getTableAt(row, col)
                    val table = tableId?.let { tableMap[it] }

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .aspectRatio(1.5f)
                            .clip(RoundedCornerShape(4.dp))
                            .background(
                                if (table != null)
                                    MaterialTheme.colorScheme.primaryContainer
                                else
                                    MaterialTheme.colorScheme.surface.copy(alpha = 0.5f)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        if (table != null) {
                            Text(
                                text = table.number,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }
                }
            }
        }
        if (layout.rows > 4) {
            Text(
                text = "... y ${layout.rows - 4} filas mas",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TableGridLayoutDialog(
    tables: List<Table>,
    initialLayout: TableGridLayout,
    onLayoutChanged: (TableGridLayout) -> Unit,
    onDismiss: () -> Unit
) {
    var layout by remember { mutableStateOf(initialLayout) }
    var selectedTableId by remember { mutableStateOf<Int?>(null) }

    val tableMap = remember(tables) { tables.associateBy { it.id } }
    val unassignedTables = remember(layout, tables) {
        layout.getUnassignedTables(tables)
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.95f)
                .fillMaxHeight(0.9f),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface
        ) {
            Column(
                modifier = Modifier.fillMaxSize()
            ) {
                // Header
                TopAppBar(
                    title = {
                        Text(
                            "Distribucion de Mesas",
                            fontWeight = FontWeight.Bold
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Clear, "Cerrar")
                        }
                    },
                    actions = {
                        IconButton(onClick = {
                            layout = TableGridLayout(
                                rows = layout.rows,
                                columns = layout.columns,
                                positions = emptyMap()
                            )
                        }) {
                            Icon(Icons.Default.Refresh, "Limpiar")
                        }
                    }
                )

                // Grid size controls
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Columns control
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("Columnas:", style = MaterialTheme.typography.bodyMedium)
                        IconButton(
                            onClick = {
                                if (layout.columns > 2) {
                                    layout = layout.copy(columns = layout.columns - 1)
                                }
                            },
                            enabled = layout.columns > 2
                        ) {
                            Icon(Icons.Default.Remove, "Menos")
                        }
                        Text(
                            "${layout.columns}",
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.width(24.dp),
                            textAlign = TextAlign.Center
                        )
                        IconButton(
                            onClick = {
                                if (layout.columns < 6) {
                                    layout = layout.copy(columns = layout.columns + 1)
                                }
                            },
                            enabled = layout.columns < 6
                        ) {
                            Icon(Icons.Default.Add, "Mas")
                        }
                    }

                    // Rows control
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("Filas:", style = MaterialTheme.typography.bodyMedium)
                        IconButton(
                            onClick = {
                                if (layout.rows > 2) {
                                    layout = layout.copy(rows = layout.rows - 1)
                                }
                            },
                            enabled = layout.rows > 2
                        ) {
                            Icon(Icons.Default.Remove, "Menos")
                        }
                        Text(
                            "${layout.rows}",
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.width(24.dp),
                            textAlign = TextAlign.Center
                        )
                        IconButton(
                            onClick = {
                                if (layout.rows < 10) {
                                    layout = layout.copy(rows = layout.rows + 1)
                                }
                            },
                            enabled = layout.rows < 10
                        ) {
                            Icon(Icons.Default.Add, "Mas")
                        }
                    }
                }

                HorizontalDivider()

                // Instructions
                Text(
                    text = if (selectedTableId != null) {
                        "Toca una celda para colocar la mesa ${tableMap[selectedTableId]?.number ?: ""}"
                    } else {
                        "Selecciona una mesa de abajo, luego toca donde colocarla"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                )

                // Grid
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    for (row in 0 until layout.rows) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            for (col in 0 until layout.columns) {
                                val tableId = layout.getTableAt(row, col)
                                val table = tableId?.let { tableMap[it] }

                                GridCell(
                                    table = table,
                                    isSelected = selectedTableId != null && tableId == selectedTableId,
                                    isEmpty = table == null,
                                    modifier = Modifier.weight(1f),
                                    onClick = {
                                        if (selectedTableId != null) {
                                            // Place selected table here
                                            layout = layout.setTableAt(row, col, selectedTableId)
                                            selectedTableId = null
                                        } else if (tableId != null) {
                                            // Remove table from this cell
                                            layout = layout.setTableAt(row, col, null)
                                        }
                                    }
                                )
                            }
                        }
                    }
                }

                HorizontalDivider()

                // Unassigned tables section
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(16.dp)
                ) {
                    Text(
                        text = "Mesas disponibles (${unassignedTables.size})",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )

                    if (unassignedTables.isEmpty()) {
                        Text(
                            text = "Todas las mesas estan asignadas",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    } else {
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            items(unassignedTables) { table ->
                                UnassignedTableChip(
                                    table = table,
                                    isSelected = selectedTableId == table.id,
                                    onClick = {
                                        selectedTableId = if (selectedTableId == table.id) {
                                            null
                                        } else {
                                            table.id
                                        }
                                    }
                                )
                            }
                        }
                    }
                }

                // Action buttons
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Cancelar")
                    }
                    Button(
                        onClick = {
                            onLayoutChanged(layout)
                            onDismiss()
                        },
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Aplicar")
                    }
                }
            }
        }
    }
}

@Composable
fun GridCell(
    table: Table?,
    isSelected: Boolean,
    isEmpty: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val backgroundColor = when {
        isSelected -> MaterialTheme.colorScheme.primary
        table != null -> {
            if (table.status == "occupied") {
                Color(0xFFFFCDD2) // Light red for occupied
            } else {
                MaterialTheme.colorScheme.primaryContainer
            }
        }
        else -> MaterialTheme.colorScheme.surfaceVariant
    }

    val borderColor = when {
        isSelected -> MaterialTheme.colorScheme.primary
        isEmpty -> MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
        else -> Color.Transparent
    }

    Surface(
        modifier = modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(8.dp))
            .border(
                width = if (isEmpty) 1.dp else 0.dp,
                color = borderColor,
                shape = RoundedCornerShape(8.dp)
            )
            .clickable(onClick = onClick),
        color = backgroundColor,
        shape = RoundedCornerShape(8.dp)
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.fillMaxSize()
        ) {
            if (table != null) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = table.number,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = if (isSelected) Color.White else {
                            if (table.status == "occupied") Color(0xFFC62828) else MaterialTheme.colorScheme.onPrimaryContainer
                        }
                    )
                    if (table.status == "occupied") {
                        Text(
                            text = "OCUPADA",
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFC62828)
                        )
                    }
                }
            } else {
                Icon(
                    Icons.Default.Add,
                    contentDescription = "Agregar mesa",
                    tint = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f),
                    modifier = Modifier.size(24.dp)
                )
            }
        }
    }
}

@Composable
fun UnassignedTableChip(
    table: Table,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(8.dp),
        color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
        )
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = table.number,
                fontWeight = FontWeight.Bold,
                color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface
            )
            if (table.name.isNotEmpty()) {
                Text(
                    text = table.name,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isSelected) Color.White.copy(alpha = 0.8f) else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
fun SettingSlider(
    title: String,
    value: Float,
    valueRange: ClosedFloatingPointRange<Float>,
    steps: Int,
    onValueChange: (Float) -> Unit,
    valueLabel: String
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = valueLabel,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold
            )
        }
        Slider(
            value = value,
            onValueChange = onValueChange,
            valueRange = valueRange,
            steps = steps
        )
    }
}
