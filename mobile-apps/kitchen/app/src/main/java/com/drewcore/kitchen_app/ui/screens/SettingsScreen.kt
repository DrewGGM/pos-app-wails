package com.drewcore.kitchen_app.ui.screens

import android.media.RingtoneManager
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drewcore.kitchen_app.data.network.ServerDiscovery
import com.drewcore.kitchen_app.data.preferences.KitchenPreferences
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
    preferences: KitchenPreferences,
    serverDiscovery: ServerDiscovery? = null,
    onBack: () -> Unit
) {
    val scope = rememberCoroutineScope()

    var gridColumns by remember { mutableStateOf(preferences.gridColumns.toFloat()) }
    var cardHeight by remember { mutableStateOf(preferences.cardHeight.toFloat()) }
    var headerFontSize by remember { mutableStateOf(preferences.headerFontSize.toFloat()) }
    var itemFontSize by remember { mutableStateOf(preferences.itemFontSize.toFloat()) }
    var maxItemsPerCard by remember { mutableStateOf(preferences.maxItemsPerCard.toFloat()) }

    // Tunnel settings
    var tunnelEnabled by remember { mutableStateOf(preferences.tunnelEnabled) }
    var tunnelUrl by remember { mutableStateOf(preferences.tunnelUrl ?: "") }
    var tunnelUseSecure by remember { mutableStateOf(preferences.tunnelUseSecure) }
    var tunnelTestStatus by remember { mutableStateOf<TunnelTestStatus>(TunnelTestStatus.Idle) }

    // Sound settings
    var customSoundUri by remember { mutableStateOf(preferences.notificationSoundUri) }
    var showSoundPicker by remember { mutableStateOf(false) }

    // Color settings for order types
    var dineInColor by remember {
        mutableStateOf(preferences.getColorForOrderType("dine-in")?.let { parseColor(it) } ?: Color(0xFFE3F2FD))
    }
    var takeoutColor by remember {
        mutableStateOf(preferences.getColorForOrderType("takeout")?.let { parseColor(it) } ?: Color(0xFFFFF3E0))
    }
    var deliveryColor by remember {
        mutableStateOf(preferences.getColorForOrderType("delivery")?.let { parseColor(it) } ?: Color(0xFFE8F5E9))
    }
    var showDineInColorPicker by remember { mutableStateOf(false) }
    var showTakeoutColorPicker by remember { mutableStateOf(false) }
    var showDeliveryColorPicker by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Configuración", fontWeight = FontWeight.Bold) },
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
            // Grid Columns
            SettingSlider(
                title = "Columnas en Cuadrícula",
                value = gridColumns,
                valueRange = 1f..4f,
                steps = 2,
                onValueChange = { gridColumns = it },
                valueLabel = "${gridColumns.toInt()} columnas"
            )

            HorizontalDivider()

            // Card Height
            SettingSlider(
                title = "Altura de Tarjetas",
                value = cardHeight,
                valueRange = 200f..400f,
                steps = 19,
                onValueChange = { cardHeight = it },
                valueLabel = "${cardHeight.toInt()} dp"
            )

            HorizontalDivider()

            // Header Font Size
            SettingSlider(
                title = "Tamaño Fuente Encabezado",
                value = headerFontSize,
                valueRange = 16f..32f,
                steps = 15,
                onValueChange = { headerFontSize = it },
                valueLabel = "${headerFontSize.toInt()} sp"
            )

            HorizontalDivider()

            // Item Font Size
            SettingSlider(
                title = "Tamaño Fuente Items",
                value = itemFontSize,
                valueRange = 10f..20f,
                steps = 9,
                onValueChange = { itemFontSize = it },
                valueLabel = "${itemFontSize.toInt()} sp"
            )

            HorizontalDivider()

            // Max Items Per Card
            SettingSlider(
                title = "Máximo Items por Tarjeta",
                value = maxItemsPerCard,
                valueRange = 3f..15f,
                steps = 11,
                onValueChange = { maxItemsPerCard = it },
                valueLabel = "${maxItemsPerCard.toInt()} items"
            )

            HorizontalDivider()

            // Sound Configuration Section
            Text(
                text = "Sonido de Notificación",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Notifications,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Column {
                            Text(
                                text = if (customSoundUri != null) "Sonido Personalizado" else "Sonido Predeterminado",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = if (customSoundUri != null) "Usando sonido personalizado" else "Usando sonido del sistema",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = { showSoundPicker = true },
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("Cambiar Sonido")
                        }

                        if (customSoundUri != null) {
                            OutlinedButton(
                                onClick = {
                                    customSoundUri = null
                                    preferences.notificationSoundUri = null
                                }
                            ) {
                                Text("Restaurar")
                            }
                        }
                    }
                }
            }

            HorizontalDivider()

            // Order Type Color Configuration Section
            Text(
                text = "Colores por Tipo de Pedido",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Palette,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = "Personaliza los colores de las tarjetas según el tipo de pedido",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    HorizontalDivider()

                    // Dine-in color
                    OrderTypeColorSetting(
                        label = "Para Comer Aquí (Dine-in)",
                        color = dineInColor,
                        onClick = { showDineInColorPicker = true }
                    )

                    // Takeout color
                    OrderTypeColorSetting(
                        label = "Para Llevar (Takeout)",
                        color = takeoutColor,
                        onClick = { showTakeoutColorPicker = true }
                    )

                    // Delivery color
                    OrderTypeColorSetting(
                        label = "Domicilio (Delivery)",
                        color = deliveryColor,
                        onClick = { showDeliveryColorPicker = true }
                    )
                }
            }

            HorizontalDivider()

            // Tunnel Configuration Section
            Text(
                text = "Conexión Remota (Tunnel)",
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
                                text = if (tunnelEnabled) "Conectar vía Internet" else "Solo red local",
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
                        Text(if (tunnelTestStatus is TunnelTestStatus.Testing) "Probando..." else "Probar Conexión")
                    }

                    // Status indicator
                    when (tunnelTestStatus) {
                        is TunnelTestStatus.Success -> {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = "Éxito",
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

            // Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Reset button
                OutlinedButton(
                    onClick = {
                        gridColumns = KitchenPreferences.DEFAULT_GRID_COLUMNS.toFloat()
                        cardHeight = KitchenPreferences.DEFAULT_CARD_HEIGHT.toFloat()
                        headerFontSize = KitchenPreferences.DEFAULT_HEADER_FONT_SIZE.toFloat()
                        itemFontSize = KitchenPreferences.DEFAULT_ITEM_FONT_SIZE.toFloat()
                        maxItemsPerCard = KitchenPreferences.DEFAULT_MAX_ITEMS_PER_CARD.toFloat()
                        // Reset sound settings
                        customSoundUri = null
                        // Reset color settings to defaults
                        dineInColor = Color(0xFFE3F2FD)
                        takeoutColor = Color(0xFFFFF3E0)
                        deliveryColor = Color(0xFFE8F5E9)
                        // Reset tunnel settings
                        tunnelEnabled = false
                        tunnelUrl = ""
                        tunnelUseSecure = true
                        tunnelTestStatus = TunnelTestStatus.Idle
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
                        preferences.cardHeight = cardHeight.toInt()
                        preferences.headerFontSize = headerFontSize.toInt()
                        preferences.itemFontSize = itemFontSize.toInt()
                        preferences.maxItemsPerCard = maxItemsPerCard.toInt()
                        // Save sound settings
                        preferences.notificationSoundUri = customSoundUri
                        // Save color settings
                        preferences.setColorForOrderType("dine-in", toHexColor(dineInColor))
                        preferences.setColorForOrderType("takeout", toHexColor(takeoutColor))
                        preferences.setColorForOrderType("delivery", toHexColor(deliveryColor))
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

            // Preview info
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
                        "💡 Consejo",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "Las órdenes con más items del máximo se dividirán en múltiples tarjetas. Las tarjetas de continuación mostrarán '(Cont.)' para indicar que pertenecen a la misma orden.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }

    // Color picker dialogs
    if (showDineInColorPicker) {
        ColorPickerDialog(
            currentColor = dineInColor,
            onColorSelected = { dineInColor = it },
            onDismiss = { showDineInColorPicker = false }
        )
    }

    if (showTakeoutColorPicker) {
        ColorPickerDialog(
            currentColor = takeoutColor,
            onColorSelected = { takeoutColor = it },
            onDismiss = { showTakeoutColorPicker = false }
        )
    }

    if (showDeliveryColorPicker) {
        ColorPickerDialog(
            currentColor = deliveryColor,
            onColorSelected = { deliveryColor = it },
            onDismiss = { showDeliveryColorPicker = false }
        )
    }

    // Sound picker dialog - Note: This requires Activity-based implementation
    // For now, showing a placeholder alert dialog
    if (showSoundPicker) {
        AlertDialog(
            onDismissRequest = { showSoundPicker = false },
            title = { Text("Seleccionar Sonido") },
            text = {
                Text(
                    "Para seleccionar un sonido personalizado, necesitas implementar la integración " +
                    "con RingtoneManager.ACTION_RINGTONE_PICKER en la Activity.\n\n" +
                    "Por ahora, el sonido se mantendrá como está configurado."
                )
            },
            confirmButton = {
                TextButton(onClick = { showSoundPicker = false }) {
                    Text("OK")
                }
            }
        )
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

@Composable
fun OrderTypeColorSetting(
    label: String,
    color: Color,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium
        )
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(color)
                .border(2.dp, MaterialTheme.colorScheme.outline, CircleShape)
        )
    }
}

// Helper function to parse color from hex string
fun parseColor(hexColor: String): Color {
    return try {
        Color(android.graphics.Color.parseColor(hexColor))
    } catch (e: Exception) {
        Color.White
    }
}

// Helper function to convert Color to hex string
fun toHexColor(color: Color): String {
    val argb = color.toArgb()
    return String.format("#%08X", argb)
}

@Composable
fun ColorPickerDialog(
    currentColor: Color,
    onColorSelected: (Color) -> Unit,
    onDismiss: () -> Unit
) {
    val predefinedColors = listOf(
        // Blues
        Color(0xFFE3F2FD), Color(0xFFBBDEFB), Color(0xFF90CAF9), Color(0xFF64B5F6),
        // Greens
        Color(0xFFE8F5E9), Color(0xFFC8E6C9), Color(0xFFA5D6A7), Color(0xFF81C784),
        // Oranges/Yellows
        Color(0xFFFFF3E0), Color(0xFFFFE0B2), Color(0xFFFFCC80), Color(0xFFFFB74D),
        // Pinks/Reds
        Color(0xFFFCE4EC), Color(0xFFF8BBD0), Color(0xFFF48FB1), Color(0xFFF06292),
        // Purples
        Color(0xFFF3E5F5), Color(0xFFE1BEE7), Color(0xFFCE93D8), Color(0xFFBA68C8),
        // Grays
        Color(0xFFF5F5F5), Color(0xFFEEEEEE), Color(0xFFE0E0E0), Color(0xFFBDBDBD)
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Seleccionar Color") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "Elige un color para este tipo de pedido:",
                    style = MaterialTheme.typography.bodyMedium
                )

                // Color grid
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    predefinedColors.chunked(4).forEach { rowColors ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            rowColors.forEach { color ->
                                Box(
                                    modifier = Modifier
                                        .size(50.dp)
                                        .clip(CircleShape)
                                        .background(color)
                                        .border(
                                            width = if (color == currentColor) 3.dp else 1.dp,
                                            color = if (color == currentColor)
                                                MaterialTheme.colorScheme.primary
                                            else
                                                MaterialTheme.colorScheme.outline,
                                            shape = CircleShape
                                        )
                                        .clickable {
                                            onColorSelected(color)
                                            onDismiss()
                                        }
                                )
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
