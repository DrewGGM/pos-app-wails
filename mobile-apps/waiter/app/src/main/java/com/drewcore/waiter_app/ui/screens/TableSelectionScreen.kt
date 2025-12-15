package com.drewcore.waiter_app.ui.screens

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.DeliveryDining
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.drewcore.waiter_app.data.models.Table

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TableSelectionScreen(
    tables: List<Table>,
    onTableSelected: (Table) -> Unit,
    onViewOrders: () -> Unit,
    onCreateTakeoutOrder: () -> Unit = {},
    onCreateDeliveryOrder: () -> Unit = {}
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Seleccionar Mesa") },
                actions = {
                    IconButton(onClick = onViewOrders) {
                        Icon(Icons.Default.List, "Ver órdenes")
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
            if (tables.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            } else {
                // Filter by status
                val availableTables = tables.filter { it.status == "available" }
                val occupiedTables = tables.filter { it.status == "occupied" }

                if (availableTables.isNotEmpty()) {
                    Text(
                        text = "Mesas Disponibles",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(16.dp, 16.dp, 16.dp, 8.dp)
                    )
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(3),
                        modifier = Modifier.weight(1f),
                        // Extra end padding to avoid FAB overlap
                        contentPadding = PaddingValues(start = 16.dp, end = 90.dp, top = 8.dp, bottom = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(availableTables) { table ->
                            TableCard(
                                table = table,
                                onClick = { onTableSelected(table) }
                            )
                        }
                    }
                }

                if (occupiedTables.isNotEmpty()) {
                    Text(
                        text = "Mesas Ocupadas",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(16.dp, 16.dp, 16.dp, 8.dp)
                    )
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(3),
                        modifier = Modifier.weight(if (availableTables.isEmpty()) 1f else 0.5f),
                        // Extra end padding to avoid FAB overlap
                        contentPadding = PaddingValues(start = 16.dp, end = 90.dp, top = 8.dp, bottom = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(occupiedTables) { table ->
                            TableCard(
                                table = table,
                                onClick = { onTableSelected(table) },
                                isDisabled = false
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun TableCard(
    table: Table,
    onClick: (() -> Unit)?,
    isDisabled: Boolean = false
) {
    val backgroundColor = when {
        isDisabled -> Color.LightGray
        else -> MaterialTheme.colorScheme.primaryContainer
    }

    val textColor = when {
        isDisabled -> Color.Gray
        else -> MaterialTheme.colorScheme.onPrimaryContainer
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
            defaultElevation = if (isDisabled) 0.dp else 4.dp
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
                color = textColor
            )
            if (table.name.isNotEmpty()) {
                Text(
                    text = table.name,
                    style = MaterialTheme.typography.bodySmall,
                    color = textColor
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = "Capacidad",
                    modifier = Modifier.size(16.dp),
                    tint = textColor
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = table.capacity.toString(),
                    style = MaterialTheme.typography.bodySmall,
                    color = textColor
                )
            }
            if (!table.zone.isNullOrEmpty()) {
                Text(
                    text = table.zone,
                    style = MaterialTheme.typography.labelSmall,
                    color = textColor.copy(alpha = 0.7f)
                )
            }
        }
    }
}
