package com.drewcore.waiter_app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drewcore.waiter_app.data.models.CartItem

// Color palette for different bill splits
private val splitColors = listOf(
    Color(0xFF2196F3), // Blue
    Color(0xFF4CAF50), // Green
    Color(0xFFFF9800), // Orange
    Color(0xFF9C27B0), // Purple
    Color(0xFFF44336), // Red
    Color(0xFF00BCD4), // Cyan
    Color(0xFFFF5722), // Deep Orange
    Color(0xFF3F51B5)  // Indigo
)

data class SplitBillItem(
    val cartItem: CartItem,
    val assignedBill: Int = 0 // 0 = unassigned, 1-8 = bill number
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SplitBillScreen(
    cartItems: List<CartItem>,
    selectedTable: com.drewcore.waiter_app.data.models.Table?,
    onBack: () -> Unit,
    onConfirmSplit: (Map<Int, List<CartItem>>) -> Unit
) {
    // State for split items
    var splitItems by remember {
        mutableStateOf(cartItems.map { SplitBillItem(it) })
    }

    // Number of bills to split into (2-8)
    var numberOfBills by remember { mutableStateOf(2) }

    // Show confirmation dialog
    var showConfirmDialog by remember { mutableStateOf(false) }

    // Calculate totals for each bill
    val billTotals = remember(splitItems) {
        (1..numberOfBills).associateWith { billNum ->
            splitItems
                .filter { it.assignedBill == billNum }
                .sumOf { it.cartItem.subtotal }
        }
    }

    // Check if all items are assigned
    val allItemsAssigned = splitItems.all { it.assignedBill > 0 }

    // Check if at least 2 bills have items
    val validSplit = billTotals.count { it.value > 0 } >= 2

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("División de Cuenta")
                        if (selectedTable != null) {
                            Text(
                                text = "Mesa ${selectedTable.number}",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, "Volver")
                    }
                },
                actions = {
                    if (allItemsAssigned && validSplit) {
                        IconButton(
                            onClick = { showConfirmDialog = true }
                        ) {
                            Icon(
                                Icons.Default.Check,
                                contentDescription = "Confirmar división",
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
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
            // Number of bills selector
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp)
                ) {
                    Text(
                        text = "¿En cuántas cuentas dividir?",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        (2..8).forEach { num ->
                            BillNumberChip(
                                number = num,
                                selected = numberOfBills == num,
                                color = splitColors[(num - 1) % splitColors.size],
                                onClick = { numberOfBills = num }
                            )
                        }
                    }
                }
            }

            // Bill totals summary
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    (1..numberOfBills).forEach { billNum ->
                        BillTotalBadge(
                            billNumber = billNum,
                            total = billTotals[billNum] ?: 0.0,
                            color = splitColors[(billNum - 1) % splitColors.size]
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Instructions
            if (!allItemsAssigned || !validSplit) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.secondaryContainer
                    )
                ) {
                    Text(
                        text = if (!allItemsAssigned) {
                            "Toca cada item para asignarlo a una cuenta"
                        } else {
                            "Asigna items a al menos 2 cuentas diferentes"
                        },
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
            }

            // Items list
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(splitItems) { splitItem ->
                    SplitBillItemCard(
                        splitItem = splitItem,
                        numberOfBills = numberOfBills,
                        onAssignBill = { billNum ->
                            splitItems = splitItems.map {
                                if (it == splitItem) it.copy(assignedBill = billNum) else it
                            }
                        }
                    )
                }
                item {
                    Spacer(modifier = Modifier.height(16.dp))
                }
            }
        }
    }

    // Confirmation dialog
    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            title = { Text("Confirmar División de Cuenta") },
            text = {
                Column {
                    Text("Se crearán ${billTotals.count { it.value > 0 }} cuentas separadas:")
                    Spacer(modifier = Modifier.height(8.dp))
                    billTotals.filter { it.value > 0 }.forEach { (billNum, total) ->
                        Text(
                            "• Cuenta $billNum: $${String.format("%.2f", total)}",
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showConfirmDialog = false
                        // Group items by bill number
                        val splitOrders = splitItems
                            .filter { it.assignedBill > 0 }
                            .groupBy { it.assignedBill }
                            .mapValues { (_, items) -> items.map { it.cartItem } }
                        onConfirmSplit(splitOrders)
                    }
                ) {
                    Text("Confirmar")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDialog = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
}

@Composable
fun BillNumberChip(
    number: Int,
    selected: Boolean,
    color: Color,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(if (selected) color else Color.Transparent)
            .border(2.dp, color, CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = number.toString(),
            color = if (selected) Color.White else color,
            fontWeight = FontWeight.Bold,
            fontSize = 18.sp
        )
    }
}

@Composable
fun BillTotalBadge(
    billNumber: Int,
    total: Double,
    color: Color
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(32.dp)
                .clip(CircleShape)
                .background(color),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = billNumber.toString(),
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp
            )
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = "$${String.format("%.2f", total)}",
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Bold,
            color = if (total > 0) color else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun SplitBillItemCard(
    splitItem: SplitBillItem,
    numberOfBills: Int,
    onAssignBill: (Int) -> Unit
) {
    var showPicker by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (splitItem.assignedBill > 0) {
                splitColors[(splitItem.assignedBill - 1) % splitColors.size].copy(alpha = 0.1f)
            } else {
                MaterialTheme.colorScheme.surface
            }
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { showPicker = true }
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = splitItem.cartItem.product.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                if (splitItem.cartItem.modifiers.isNotEmpty()) {
                    Text(
                        text = splitItem.cartItem.modifiers.joinToString(", ") { it.name },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    text = "Cantidad: ${splitItem.cartItem.quantity} × $${String.format("%.2f", splitItem.cartItem.unitPrice)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "$${String.format("%.2f", splitItem.cartItem.subtotal)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )

                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(
                            if (splitItem.assignedBill > 0) {
                                splitColors[(splitItem.assignedBill - 1) % splitColors.size]
                            } else {
                                MaterialTheme.colorScheme.surfaceVariant
                            }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (splitItem.assignedBill > 0) splitItem.assignedBill.toString() else "?",
                        color = if (splitItem.assignedBill > 0) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }

    // Bill picker dialog
    if (showPicker) {
        AlertDialog(
            onDismissRequest = { showPicker = false },
            title = { Text("Asignar a cuenta") },
            text = {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    (1..numberOfBills).forEach { billNum ->
                        Button(
                            onClick = {
                                onAssignBill(billNum)
                                showPicker = false
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = splitColors[(billNum - 1) % splitColors.size]
                            )
                        ) {
                            Text("Cuenta $billNum")
                        }
                    }
                    if (splitItem.assignedBill > 0) {
                        OutlinedButton(
                            onClick = {
                                onAssignBill(0)
                                showPicker = false
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Desasignar")
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showPicker = false }) {
                    Text("Cancelar")
                }
            }
        )
    }
}
