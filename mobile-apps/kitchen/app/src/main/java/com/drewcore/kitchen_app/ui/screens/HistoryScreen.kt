package com.drewcore.kitchen_app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.NavigateBefore
import androidx.compose.material.icons.filled.NavigateNext
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drewcore.kitchen_app.data.models.Order
import kotlin.math.ceil

@Composable
fun HistoryScreen(
    completedOrders: List<Order>,
    onRemove: (Order) -> Unit,
    onUndo: (Order) -> Unit
) {
    // Pagination state
    var currentPage by remember { mutableStateOf(1) }
    val itemsPerPage = 10
    val totalItems = completedOrders.size
    val totalPages = if (totalItems > 0) ceil(totalItems.toDouble() / itemsPerPage).toInt() else 1

    // Reset to page 1 if current page exceeds total pages (happens when deleting items)
    LaunchedEffect(totalPages) {
        if (currentPage > totalPages && totalPages > 0) {
            currentPage = totalPages
        }
    }

    // Calculate the items for the current page
    val startIndex = (currentPage - 1) * itemsPerPage
    val endIndex = minOf(startIndex + itemsPerPage, totalItems)
    val currentPageOrders = if (completedOrders.isNotEmpty()) {
        completedOrders.subList(startIndex, endIndex)
    } else {
        emptyList()
    }

    if (completedOrders.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "📝",
                    fontSize = 64.sp
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "No hay órdenes completadas",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    } else {
        Column(
            modifier = Modifier.fillMaxSize()
        ) {
            // Orders list
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 16.dp)
                    .padding(top = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(currentPageOrders, key = { it.id }) { order ->
                    CompletedOrderCard(
                        order = order,
                        onRemove = onRemove,
                        onUndo = onUndo
                    )
                }
            }

            // Pagination controls
            if (totalPages > 1) {
                PaginationControls(
                    currentPage = currentPage,
                    totalPages = totalPages,
                    totalItems = totalItems,
                    onPreviousPage = {
                        if (currentPage > 1) currentPage--
                    },
                    onNextPage = {
                        if (currentPage < totalPages) currentPage++
                    }
                )
            }
        }
    }
}

@Composable
fun CompletedOrderCard(
    order: Order,
    onRemove: (Order) -> Unit,
    onUndo: (Order) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(
            containerColor = Color(0xFFF1F8E9)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "✓",
                        fontSize = 20.sp,
                        color = Color(0xFF4CAF50)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            text = getOrderTitle(order),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        OrderTimer(createdAt = order.createdAt)
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Items summary
            order.items.forEach { item ->
                Text(
                    text = "${item.quantity}x ${item.product.name}",
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Action buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = { onUndo(order) },
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = "Deshacer")
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Deshacer")
                }

                OutlinedButton(
                    onClick = { onRemove(order) },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Icon(Icons.Default.Delete, contentDescription = "Eliminar")
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Eliminar")
                }
            }
        }
    }
}

@Composable
fun PaginationControls(
    currentPage: Int,
    totalPages: Int,
    totalItems: Int,
    onPreviousPage: () -> Unit,
    onNextPage: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        tonalElevation = 8.dp,
        shadowElevation = 4.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Previous button
            IconButton(
                onClick = onPreviousPage,
                enabled = currentPage > 1
            ) {
                Icon(
                    Icons.Default.NavigateBefore,
                    contentDescription = "Página anterior",
                    tint = if (currentPage > 1)
                        MaterialTheme.colorScheme.primary
                    else
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                )
            }

            // Page indicator
            Column(
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Página $currentPage de $totalPages",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "$totalItems órdenes totales",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Next button
            IconButton(
                onClick = onNextPage,
                enabled = currentPage < totalPages
            ) {
                Icon(
                    Icons.Default.NavigateNext,
                    contentDescription = "Página siguiente",
                    tint = if (currentPage < totalPages)
                        MaterialTheme.colorScheme.primary
                    else
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                )
            }
        }
    }
}
