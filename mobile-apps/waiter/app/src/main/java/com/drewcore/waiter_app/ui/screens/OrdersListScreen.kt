package com.drewcore.waiter_app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.drewcore.waiter_app.data.models.OrderResponse
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.*

// Helper function to get order title based on order type
fun getOrderTitle(order: OrderResponse): String {
    // Use new orderType if available
    return when {
        order.orderType != null -> {
            when {
                // For table-based orders (dine-in), show table number
                order.orderType.code == "dine-in" && order.table != null ->
                    "Mesa ${order.table.number}"
                // For orders with sequential numbering, show prefix + number
                order.orderType.requiresSequentialNumber && order.sequenceNumber != null ->
                    "${order.orderType.sequencePrefix ?: ""}${order.sequenceNumber}"
                // Otherwise show order type name
                else -> order.orderType.name
            }
        }
        // Fallback to old type field for backward compatibility
        else -> when (order.type) {
            "dine_in", "dine-in" -> if (order.tableNumber != null) "Mesa ${order.tableNumber}" else order.orderNumber
            "takeout" -> if (order.takeoutNumber != null) "#${order.takeoutNumber}" else "Para Llevar"
            "delivery" -> "Domicilio"
            else -> order.orderNumber
        }
    }
}

fun getOrderSubtitle(order: OrderResponse): String? {
    return when {
        order.orderType != null -> {
            when {
                order.orderType.code == "dine-in" && order.table != null -> null
                order.orderType.requiresSequentialNumber -> order.orderType.name
                else -> null
            }
        }
        else -> when (order.type) {
            "dine_in", "dine-in" -> if (order.tableNumber != null) null else "En Mesa"
            "takeout" -> "Para Llevar"
            "delivery" -> null
            else -> null
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrdersListScreen(
    orders: List<OrderResponse>,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onViewInCart: (OrderResponse) -> Unit = {},
    onDeleteOrder: (OrderResponse) -> Unit = {},
    onMarkAsReady: (OrderResponse) -> Unit = {}
) {
    var selectedFilter by remember { mutableStateOf("all") }

    val filteredOrders = when (selectedFilter) {
        "pending" -> orders.filter { it.status == "pending" }
        "preparing" -> orders.filter { it.status == "preparing" }
        "ready" -> orders.filter { it.status == "ready" }
        else -> orders
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Órdenes") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Volver")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Filter Chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = selectedFilter == "all",
                    onClick = { selectedFilter = "all" },
                    label = { Text("Todas") }
                )
                FilterChip(
                    selected = selectedFilter == "pending",
                    onClick = { selectedFilter = "pending" },
                    label = { Text("Pendientes") }
                )
                FilterChip(
                    selected = selectedFilter == "preparing",
                    onClick = { selectedFilter = "preparing" },
                    label = { Text("Preparando") }
                )
                FilterChip(
                    selected = selectedFilter == "ready",
                    onClick = { selectedFilter = "ready" },
                    label = { Text("Listas") }
                )
            }

            Divider()

            if (filteredOrders.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No hay órdenes",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(filteredOrders) { order ->
                        OrderCard(
                            order = order,
                            onViewInCart = { onViewInCart(order) },
                            onDelete = { onDeleteOrder(order) },
                            onMarkAsReady = { onMarkAsReady(order) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun OrderCard(
    order: OrderResponse,
    onViewInCart: () -> Unit = {},
    onDelete: () -> Unit = {},
    onMarkAsReady: () -> Unit = {}
) {
    val currencyFormat = remember { NumberFormat.getCurrencyInstance(Locale("es", "CO")) }
    val dateFormat = remember { SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault()) }
    var showDeleteDialog by remember { mutableStateOf(false) }

    val statusColor = when (order.status) {
        "pending" -> MaterialTheme.colorScheme.error
        "preparing" -> MaterialTheme.colorScheme.tertiary
        "ready" -> MaterialTheme.colorScheme.primary
        "delivered" -> Color.Gray
        else -> MaterialTheme.colorScheme.onSurface
    }

    val statusText = when (order.status) {
        "pending" -> "Pendiente"
        "preparing" -> "Preparando"
        "ready" -> "Lista"
        "delivered" -> "Entregada"
        "paid" -> "Pagada"
        else -> order.status
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = getOrderTitle(order),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    val subtitle = getOrderSubtitle(order)
                    if (subtitle != null) {
                        Text(
                            text = subtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Surface(
                    color = statusColor.copy(alpha = 0.1f),
                    shape = MaterialTheme.shapes.small
                ) {
                    Text(
                        text = statusText,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = statusColor,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Items
            order.items.forEach { item ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 2.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "${item.quantity}x ${item.productName}",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = currencyFormat.format(item.subtotal),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                if (!item.notes.isNullOrEmpty()) {
                    Text(
                        text = "  Nota: ${item.notes}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 16.dp)
                    )
                }
                // Display modifiers if any
                if (!item.modifiers.isNullOrEmpty()) {
                    Column(
                        modifier = Modifier.padding(start = 16.dp, top = 4.dp)
                    ) {
                        item.modifiers.forEach { modifier ->
                            val priceText = if (modifier.priceChange != 0.0) {
                                " (${if (modifier.priceChange > 0) "+" else ""}$${String.format("%.0f", modifier.priceChange)})"
                            } else ""
                            Text(
                                text = "  + ${modifier.modifier?.name ?: ""}$priceText",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.secondary,
                                fontStyle = androidx.compose.ui.text.font.FontStyle.Italic
                            )
                        }
                    }
                }
            }

            Divider(modifier = Modifier.padding(vertical = 8.dp))

            // Footer
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = try {
                        val date = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()).parse(order.createdAt)
                        dateFormat.format(date ?: Date())
                    } catch (e: Exception) {
                        order.createdAt
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Text(
                    text = "Total: ${currencyFormat.format(order.total)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            if (order.notes != null && order.notes.isNotEmpty()) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.small
                ) {
                    Text(
                        text = "Nota: ${order.notes}",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(8.dp)
                    )
                }
            }

            // Action Buttons
            Spacer(modifier = Modifier.height(12.dp))

            // Mark as Ready button (only for preparing orders)
            if (order.status == "preparing") {
                Button(
                    onClick = onMarkAsReady,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    )
                ) {
                    Icon(Icons.Default.CheckCircle, contentDescription = "Marcar como lista", modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("MARCAR COMO LISTA", fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.height(8.dp))
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = onViewInCart,
                    modifier = Modifier.weight(1f)
                ) {
                    Icon(Icons.Default.Edit, contentDescription = "Ver en carrito", modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Ver/Editar")
                }

                OutlinedButton(
                    onClick = { showDeleteDialog = true },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Icon(Icons.Default.Delete, contentDescription = "Eliminar", modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Eliminar")
                }
            }
        }
    }

    // Delete confirmation dialog
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Eliminar orden") },
            text = { Text("¿Estás seguro de que deseas eliminar esta orden?") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteDialog = false
                        onDelete()
                    }
                ) {
                    Text("Eliminar", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
}
