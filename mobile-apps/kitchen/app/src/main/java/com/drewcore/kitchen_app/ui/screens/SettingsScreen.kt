package com.drewcore.kitchen_app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drewcore.kitchen_app.data.preferences.KitchenPreferences

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    preferences: KitchenPreferences,
    onBack: () -> Unit
) {
    var gridColumns by remember { mutableStateOf(preferences.gridColumns.toFloat()) }
    var cardHeight by remember { mutableStateOf(preferences.cardHeight.toFloat()) }
    var headerFontSize by remember { mutableStateOf(preferences.headerFontSize.toFloat()) }
    var itemFontSize by remember { mutableStateOf(preferences.itemFontSize.toFloat()) }
    var maxItemsPerCard by remember { mutableStateOf(preferences.maxItemsPerCard.toFloat()) }

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

            Divider()

            // Card Height
            SettingSlider(
                title = "Altura de Tarjetas",
                value = cardHeight,
                valueRange = 200f..400f,
                steps = 19,
                onValueChange = { cardHeight = it },
                valueLabel = "${cardHeight.toInt()} dp"
            )

            Divider()

            // Header Font Size
            SettingSlider(
                title = "Tamaño Fuente Encabezado",
                value = headerFontSize,
                valueRange = 16f..32f,
                steps = 15,
                onValueChange = { headerFontSize = it },
                valueLabel = "${headerFontSize.toInt()} sp"
            )

            Divider()

            // Item Font Size
            SettingSlider(
                title = "Tamaño Fuente Items",
                value = itemFontSize,
                valueRange = 10f..20f,
                steps = 9,
                onValueChange = { itemFontSize = it },
                valueLabel = "${itemFontSize.toInt()} sp"
            )

            Divider()

            // Max Items Per Card
            SettingSlider(
                title = "Máximo Items por Tarjeta",
                value = maxItemsPerCard,
                valueRange = 3f..15f,
                steps = 11,
                onValueChange = { maxItemsPerCard = it },
                valueLabel = "${maxItemsPerCard.toInt()} items"
            )

            Divider()

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
                        preferences.resetToDefaults()
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
