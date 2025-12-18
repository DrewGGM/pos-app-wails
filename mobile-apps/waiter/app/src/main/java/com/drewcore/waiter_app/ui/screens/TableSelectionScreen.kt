package com.drewcore.waiter_app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DeliveryDining
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drewcore.waiter_app.data.models.Table
import com.drewcore.waiter_app.data.models.TableArea
import com.drewcore.waiter_app.data.models.TableGridLayout
import com.drewcore.waiter_app.data.models.TableStatus

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TableSelectionScreen(
    tables: List<Table>,
    tableAreas: List<TableArea> = emptyList(),
    areaGridLayouts: Map<Int, TableGridLayout> = emptyMap(),
    onTableSelected: (Table) -> Unit,
    onViewOrders: () -> Unit,
    onOpenSettings: () -> Unit = {},
    onRefresh: () -> Unit = {},
    onCreateTakeoutOrder: () -> Unit = {},
    onCreateDeliveryOrder: () -> Unit = {}
) {
    val tableMap = remember(tables) { tables.associateBy { it.id } }

    // Default to first area if available
    var selectedAreaId by remember(tableAreas) {
        mutableStateOf(tableAreas.firstOrNull()?.id)
    }

    // Filter tables by selected area
    val filteredTables = remember(tables, selectedAreaId) {
        if (selectedAreaId == null) {
            tables
        } else {
            tables.filter { it.areaId == selectedAreaId || it.area?.id == selectedAreaId }
        }
    }
    val filteredTableMap = remember(filteredTables) { filteredTables.associateBy { it.id } }

    // Get grid layout for selected area
    val currentGridLayout = remember(selectedAreaId, areaGridLayouts) {
        selectedAreaId?.let { areaGridLayouts[it] }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Seleccionar Mesa") },
                actions = {
                    IconButton(onClick = onRefresh) {
                        Icon(Icons.Default.Refresh, "Sincronizar")
                    }
                    IconButton(onClick = onViewOrders) {
                        Icon(Icons.Default.List, "Ver ordenes")
                    }
                    IconButton(onClick = onOpenSettings) {
                        Icon(Icons.Default.Settings, "Configuración")
                    }
                }
            )
        },
        floatingActionButton = {
            // Two FABs stacked vertically
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Delivery FAB
                FloatingActionButton(
                    onClick = onCreateDeliveryOrder,
                    containerColor = MaterialTheme.colorScheme.tertiary
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(8.dp)
                    ) {
                        Icon(
                            Icons.Default.DeliveryDining,
                            contentDescription = "Pedido a domicilio"
                        )
                        Text(
                            text = "Domicilio",
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }

                // Takeout FAB
                FloatingActionButton(
                    onClick = onCreateTakeoutOrder,
                    containerColor = MaterialTheme.colorScheme.primary
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(8.dp)
                    ) {
                        Icon(
                            Icons.Default.ShoppingBag,
                            contentDescription = "Pedido para llevar"
                        )
                        Text(
                            text = "Para Llevar",
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Area filter chips (only show if there are multiple areas)
            if (tableAreas.size > 1) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Area chips only (no "Todas" option)
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

            if (filteredTables.isEmpty() && tables.isNotEmpty()) {
                // No tables in selected area
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No hay mesas en esta área",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else if (tables.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else if (currentGridLayout != null && currentGridLayout.positions.isNotEmpty()) {
                // Grid layout mode - show tables according to configured layout for this area
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    for (row in 0 until currentGridLayout.rows) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            for (col in 0 until currentGridLayout.columns) {
                                val tableId = currentGridLayout.getTableAt(row, col)
                                val table = tableId?.let { filteredTableMap[it] }

                                Box(modifier = Modifier.weight(1f)) {
                                    if (table != null) {
                                        TableCard(
                                            table = table,
                                            onClick = { onTableSelected(table) }
                                        )
                                    } else {
                                        // Empty cell
                                        EmptyTableCell()
                                    }
                                }
                            }
                        }
                    }

                    // Show unassigned tables at the bottom if any
                    val assignedIds = currentGridLayout.positions.values.toSet()
                    val unassignedTables = filteredTables.filter { it.id !in assignedIds }

                    if (unassignedTables.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Otras Mesas",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )
                        // Simple grid for unassigned tables
                        val unassignedColumns = 4
                        unassignedTables.chunked(unassignedColumns).forEach { rowTables ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                rowTables.forEach { table ->
                                    Box(modifier = Modifier.weight(1f)) {
                                        TableCard(
                                            table = table,
                                            onClick = { onTableSelected(table) }
                                        )
                                    }
                                }
                                // Fill remaining space
                                repeat(unassignedColumns - rowTables.size) {
                                    Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                            Spacer(modifier = Modifier.height(12.dp))
                        }
                    }

                    // Extra bottom padding for FABs
                    Spacer(modifier = Modifier.height(100.dp))
                }
            } else {
                // Simple grid layout (for area filtering or when no custom layout configured)
                val defaultColumns = 4
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    filteredTables.chunked(defaultColumns).forEach { rowTables ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            rowTables.forEach { table ->
                                Box(modifier = Modifier.weight(1f)) {
                                    TableCard(
                                        table = table,
                                        onClick = { onTableSelected(table) }
                                    )
                                }
                            }
                            // Fill remaining space
                            repeat(defaultColumns - rowTables.size) {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }

                    // Extra bottom padding for FABs
                    Spacer(modifier = Modifier.height(100.dp))
                }
            }
        }
    }
}

@Composable
fun EmptyTableCell() {
    Box(
        modifier = Modifier
            .aspectRatio(1f)
            .clip(RoundedCornerShape(12.dp))
            .background(Color.Transparent)
    )
}

@Composable
fun TableCard(
    table: Table,
    onClick: (() -> Unit)?
) {
    // Colors and labels for each table status
    val (backgroundColor, contentColor, statusLabel) = when (table.status) {
        TableStatus.OCCUPIED -> Triple(
            Color(0xFFFFE0B2), // Light orange
            Color(0xFFE65100), // Dark orange
            "OCUPADA"
        )
        TableStatus.RESERVED -> Triple(
            Color(0xFFBBDEFB), // Light blue
            Color(0xFF1565C0), // Dark blue
            "RESERVADA"
        )
        TableStatus.CLEANING -> Triple(
            Color(0xFFCFD8DC), // Light blue-gray
            Color(0xFF546E7A), // Dark blue-gray
            "LIMPIANDO"
        )
        TableStatus.BLOCKED -> Triple(
            Color(0xFFFFCDD2), // Light red
            Color(0xFFC62828), // Dark red
            "BLOQUEADA"
        )
        else -> Triple( // Available
            Color(0xFFC8E6C9), // Light green
            Color(0xFF2E7D32), // Dark green
            null
        )
    }

    Card(
        modifier = Modifier
            .aspectRatio(1f)
            .then(
                if (onClick != null) {
                    Modifier.clickable(onClick = onClick)
                } else {
                    Modifier
                }
            ),
        colors = CardDefaults.cardColors(
            containerColor = backgroundColor
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = 4.dp
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = table.number,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                color = contentColor
            )
            if (table.name.isNotEmpty()) {
                Text(
                    text = table.name,
                    style = MaterialTheme.typography.bodySmall,
                    color = contentColor
                )
            }

            // Show status badge if not available
            if (statusLabel != null) {
                Spacer(modifier = Modifier.height(2.dp))
                Surface(
                    color = contentColor,
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text(
                        text = statusLabel,
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                    )
                }
            } else {
                // Show capacity for available tables
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = "Capacidad",
                        modifier = Modifier.size(16.dp),
                        tint = contentColor
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = table.capacity.toString(),
                        style = MaterialTheme.typography.bodySmall,
                        color = contentColor
                    )
                }
            }

            // Show area name if available (don't show legacy zone field)
            if (table.area != null) {
                Text(
                    text = table.area.name,
                    style = MaterialTheme.typography.labelSmall,
                    color = contentColor.copy(alpha = 0.7f)
                )
            }
        }
    }
}
