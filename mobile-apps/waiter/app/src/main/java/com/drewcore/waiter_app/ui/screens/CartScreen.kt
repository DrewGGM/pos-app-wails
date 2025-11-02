package com.drewcore.waiter_app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drewcore.waiter_app.data.models.CartItem

@Composable
fun CartScreen(
    cartItems: List<CartItem>,
    cartTotal: Double,
    selectedTable: com.drewcore.waiter_app.data.models.Table? = null,
    isEditingOrder: Boolean = false,
    onUpdateQuantity: (CartItem, Int) -> Unit,
    onUpdateNotes: (CartItem, String) -> Unit,
    onRemoveItem: (CartItem) -> Unit,
    onSendOrder: () -> Unit,
    onCancelOrder: (() -> Unit)? = null
) {
    var editingItem by remember { mutableStateOf<CartItem?>(null) }
    var showCancelDialog by remember { mutableStateOf(false) }

    if (cartItems.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "🛒",
                    fontSize = 64.sp
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "El carrito está vacío",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    } else {
        Column(modifier = Modifier.fillMaxSize()) {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(cartItems, key = { it.product.id }) { item ->
                    CartItemCard(
                        item = item,
                        onUpdateQuantity = onUpdateQuantity,
                        onRemoveItem = onRemoveItem,
                        onEditNotes = { editingItem = it }
                    )
                }
            }

            // Total and send button
            Surface(
                modifier = Modifier.fillMaxWidth(),
                tonalElevation = 8.dp,
                shadowElevation = 8.dp
            ) {
                Column(
                    modifier = Modifier.padding(16.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Total:",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "$${String.format("%.2f", cartTotal)}",
                            style = MaterialTheme.typography.headlineMedium,
                            color = MaterialTheme.colorScheme.primary,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Cancel order button (only if editing an existing order)
                    if (isEditingOrder && onCancelOrder != null) {
                        OutlinedButton(
                            onClick = { showCancelDialog = true },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = MaterialTheme.colorScheme.error
                            )
                        ) {
                            Icon(Icons.Default.Delete, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "CANCELAR PEDIDO Y DESOCUPAR MESA",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                    }

                    Button(
                        onClick = { onSendOrder() },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.primary
                        )
                    ) {
                        val buttonText = if (isEditingOrder) {
                            if (selectedTable != null) "ACTUALIZAR PEDIDO - Mesa ${selectedTable.number}" else "ACTUALIZAR PEDIDO - PARA LLEVAR"
                        } else {
                            if (selectedTable != null) "ENVIAR PEDIDO - Mesa ${selectedTable.number}" else "ENVIAR PEDIDO - PARA LLEVAR"
                        }
                        Text(
                            text = buttonText,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }
                }
            }
        }
    }

    // Cancel order confirmation dialog
    if (showCancelDialog) {
        AlertDialog(
            onDismissRequest = { showCancelDialog = false },
            title = { Text("Cancelar Pedido") },
            text = {
                Text(
                    "¿Estás seguro que deseas cancelar este pedido? " +
                    if (selectedTable != null) "La mesa ${selectedTable.number} quedará disponible." else "Esta acción no se puede deshacer."
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        showCancelDialog = false
                        onCancelOrder?.invoke()
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    Text("Cancelar Pedido")
                }
            },
            dismissButton = {
                TextButton(onClick = { showCancelDialog = false }) {
                    Text("Volver")
                }
            }
        )
    }

    // Edit notes dialog
    editingItem?.let { item ->
        EditNotesDialog(
            item = item,
            onDismiss = { editingItem = null },
            onSave = { notes ->
                onUpdateNotes(item, notes)
                editingItem = null
            }
        )
    }
}

@Composable
fun CartItemCard(
    item: CartItem,
    onUpdateQuantity: (CartItem, Int) -> Unit,
    onRemoveItem: (CartItem) -> Unit,
    onEditNotes: (CartItem) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = item.product.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "$${String.format("%.2f", item.product.price)} c/u",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                IconButton(
                    onClick = { onRemoveItem(item) }
                ) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = "Eliminar",
                        tint = MaterialTheme.colorScheme.error
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Quantity controls
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(
                        onClick = { onUpdateQuantity(item, item.quantity - 1) }
                    ) {
                        Icon(Icons.Default.Remove, contentDescription = "Disminuir")
                    }

                    Surface(
                        color = MaterialTheme.colorScheme.primaryContainer,
                        shape = MaterialTheme.shapes.small
                    ) {
                        Text(
                            text = "${item.quantity}",
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    IconButton(
                        onClick = { onUpdateQuantity(item, item.quantity + 1) }
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Aumentar")
                    }
                }

                Text(
                    text = "$${String.format("%.2f", item.subtotal)}",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold
                )
            }

            // Notes section
            if (item.notes.isNotBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    color = Color(0xFFFFF3E0),
                    shape = MaterialTheme.shapes.small
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Nota: ${item.notes}",
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodyMedium
                        )
                        IconButton(onClick = { onEditNotes(item) }) {
                            Icon(Icons.Default.Edit, contentDescription = "Editar nota", tint = Color(0xFFFF6F00))
                        }
                    }
                }
            } else {
                Spacer(modifier = Modifier.height(8.dp))
                OutlinedButton(
                    onClick = { onEditNotes(item) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.Edit, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Agregar nota")
                }
            }
        }
    }
}

@Composable
fun EditNotesDialog(
    item: CartItem,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    var notes by remember { mutableStateOf(item.notes) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Notas para ${item.product.name}") },
        text = {
            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Indicaciones especiales") },
                placeholder = { Text("Ej: Sin cebolla, término medio...") },
                modifier = Modifier.fillMaxWidth(),
                maxLines = 4
            )
        },
        confirmButton = {
            Button(onClick = { onSave(notes) }) {
                Text("Guardar")
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
fun SendOrderDialog(
    onDismiss: () -> Unit,
    onConfirm: (Int?) -> Unit
) {
    var tableNumber by remember { mutableStateOf("") }
    var selectedType by remember { mutableStateOf("dine-in") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Enviar Pedido") },
        text = {
            Column {
                Text("Tipo de pedido:")
                Spacer(modifier = Modifier.height(8.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = selectedType == "dine-in",
                        onClick = { selectedType = "dine-in" }
                    )
                    Text("Mesa")
                    Spacer(modifier = Modifier.width(16.dp))
                    RadioButton(
                        selected = selectedType == "takeout",
                        onClick = { selectedType = "takeout" }
                    )
                    Text("Para Llevar")
                }

                if (selectedType == "dine-in") {
                    Spacer(modifier = Modifier.height(16.dp))
                    OutlinedTextField(
                        value = tableNumber,
                        onValueChange = { tableNumber = it.filter { c -> c.isDigit() } },
                        label = { Text("Número de mesa") },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val table = if (selectedType == "dine-in" && tableNumber.isNotBlank()) {
                        tableNumber.toIntOrNull()
                    } else null
                    onConfirm(table)
                },
                enabled = selectedType == "takeout" || tableNumber.isNotBlank()
            ) {
                Text("Confirmar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancelar")
            }
        }
    )
}
