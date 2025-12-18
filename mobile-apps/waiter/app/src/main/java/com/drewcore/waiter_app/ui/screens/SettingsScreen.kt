package com.drewcore.waiter_app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.DragHandle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.TableBar
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.drewcore.waiter_app.data.models.Table
import com.drewcore.waiter_app.data.preferences.WaiterPreferences
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    preferences: WaiterPreferences,
    tables: List<Table> = emptyList(),
    onBack: () -> Unit
) {
    var gridColumns by remember { mutableStateOf(preferences.gridColumns.toFloat()) }
    var tableGridColumns by remember { mutableStateOf(preferences.tableGridColumns.toFloat()) }
    var showTableOrderDialog by remember { mutableStateOf(false) }

    // Get saved table order or use default
    var customTableOrder by remember {
        mutableStateOf(preferences.getTableOrder() ?: tables.map { it.id })
    }

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
                text = "Mesas",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )

            // Table Grid Columns
            SettingSlider(
                title = "Columnas de Mesas",
                value = tableGridColumns,
                valueRange = 2f..5f,
                steps = 2,
                onValueChange = { tableGridColumns = it },
                valueLabel = "${tableGridColumns.toInt()} columnas"
            )

            // Table Order Button
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { showTableOrderDialog = true },
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
                            Icons.Default.TableBar,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Column {
                            Text(
                                text = "Ordenar Mesas",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = "Arrastra para personalizar el orden",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Icon(
                        Icons.Default.DragHandle,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
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
                        tableGridColumns = WaiterPreferences.DEFAULT_TABLE_GRID_COLUMNS.toFloat()
                        customTableOrder = tables.map { it.id }
                        preferences.clearTableOrder()
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
                        preferences.tableGridColumns = tableGridColumns.toInt()
                        preferences.setTableOrder(customTableOrder)
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
                        "💡 Consejo",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "Ajusta el número de columnas y el orden de las mesas según tu preferencia. Mantén presionado y arrastra para reordenar las mesas.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }

    // Table Order Dialog
    if (showTableOrderDialog && tables.isNotEmpty()) {
        TableOrderDialog(
            tables = tables,
            currentOrder = customTableOrder,
            onOrderChanged = { customTableOrder = it },
            onDismiss = { showTableOrderDialog = false },
            onReset = {
                customTableOrder = tables.map { it.id }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TableOrderDialog(
    tables: List<Table>,
    currentOrder: List<Int>,
    onOrderChanged: (List<Int>) -> Unit,
    onDismiss: () -> Unit,
    onReset: () -> Unit
) {
    // Sort tables by current order
    val orderedTables = remember(tables, currentOrder) {
        val orderMap = currentOrder.withIndex().associate { it.value to it.index }
        tables.sortedBy { orderMap[it.id] ?: Int.MAX_VALUE }
    }

    var items by remember(orderedTables) { mutableStateOf(orderedTables) }
    var draggedItem by remember { mutableStateOf<Table?>(null) }
    var draggedIndex by remember { mutableStateOf(-1) }
    var dragOffset by remember { mutableStateOf(0f) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Ordenar Mesas", fontWeight = FontWeight.Bold)
                IconButton(onClick = {
                    items = tables
                    onReset()
                }) {
                    Icon(
                        Icons.Default.Refresh,
                        contentDescription = "Restaurar orden",
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }
        },
        text = {
            Column {
                Text(
                    text = "Mantén presionado y arrastra para reordenar",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 12.dp)
                )

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 400.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    itemsIndexed(items, key = { _, table -> table.id }) { index, table ->
                        val isDragging = draggedItem?.id == table.id

                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .then(
                                    if (isDragging) {
                                        Modifier
                                            .zIndex(1f)
                                            .offset { IntOffset(0, dragOffset.roundToInt()) }
                                            .shadow(8.dp, RoundedCornerShape(8.dp))
                                    } else {
                                        Modifier
                                    }
                                )
                                .pointerInput(Unit) {
                                    detectDragGesturesAfterLongPress(
                                        onDragStart = {
                                            draggedItem = table
                                            draggedIndex = index
                                            dragOffset = 0f
                                        },
                                        onDragEnd = {
                                            draggedItem = null
                                            draggedIndex = -1
                                            dragOffset = 0f
                                            onOrderChanged(items.map { it.id })
                                        },
                                        onDragCancel = {
                                            draggedItem = null
                                            draggedIndex = -1
                                            dragOffset = 0f
                                        },
                                        onDrag = { change, dragAmount ->
                                            change.consume()
                                            dragOffset += dragAmount.y

                                            // Calculate new position
                                            val itemHeight = 56.dp.toPx()
                                            val targetIndex = (draggedIndex + (dragOffset / itemHeight).roundToInt())
                                                .coerceIn(0, items.lastIndex)

                                            if (targetIndex != draggedIndex && draggedItem != null) {
                                                val mutableList = items.toMutableList()
                                                val item = mutableList.removeAt(draggedIndex)
                                                mutableList.add(targetIndex, item)
                                                items = mutableList
                                                draggedIndex = targetIndex
                                                dragOffset = 0f
                                            }
                                        }
                                    )
                                },
                            color = if (isDragging)
                                MaterialTheme.colorScheme.primaryContainer
                            else
                                MaterialTheme.colorScheme.surface,
                            shape = RoundedCornerShape(8.dp),
                            tonalElevation = if (isDragging) 8.dp else 1.dp
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Surface(
                                        color = MaterialTheme.colorScheme.primaryContainer,
                                        shape = RoundedCornerShape(4.dp)
                                    ) {
                                        Text(
                                            text = table.number,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.onPrimaryContainer
                                        )
                                    }
                                    if (table.name.isNotEmpty()) {
                                        Text(
                                            text = table.name,
                                            style = MaterialTheme.typography.bodyMedium
                                        )
                                    }
                                }
                                Icon(
                                    Icons.Default.DragHandle,
                                    contentDescription = "Arrastrar",
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                onOrderChanged(items.map { it.id })
                onDismiss()
            }) {
                Text("Aplicar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        }
    )
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
