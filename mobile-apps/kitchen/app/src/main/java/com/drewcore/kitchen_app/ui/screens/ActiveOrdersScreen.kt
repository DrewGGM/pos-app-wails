package com.drewcore.kitchen_app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drewcore.kitchen_app.data.models.Order
import com.drewcore.kitchen_app.data.models.OrderItem
import com.drewcore.kitchen_app.data.models.OrderDisplayState
import com.drewcore.kitchen_app.data.preferences.KitchenPreferences
import java.text.SimpleDateFormat
import java.util.*

// Data class to represent a display card (can be original order or continuation)
data class OrderCardData(
    val order: Order,
    val items: List<OrderItem>,
    val cardIndex: Int, // 0 for first card, 1+ for continuations
    val totalCards: Int,
    val uniqueKey: String
)

// Split an order into multiple cards if needed
fun splitOrderIntoCards(order: Order, maxItemsPerCard: Int): List<OrderCardData> {
    if (order.items.size <= maxItemsPerCard) {
        // Order fits in one card
        return listOf(
            OrderCardData(
                order = order,
                items = order.items,
                cardIndex = 0,
                totalCards = 1,
                uniqueKey = order.id
            )
        )
    }

    // Split into multiple cards
    val cards = mutableListOf<OrderCardData>()
    val itemChunks = order.items.chunked(maxItemsPerCard)

    itemChunks.forEachIndexed { index, chunk ->
        cards.add(
            OrderCardData(
                order = order,
                items = chunk,
                cardIndex = index,
                totalCards = itemChunks.size,
                uniqueKey = "${order.id}_$index"
            )
        )
    }

    return cards
}

@Composable
fun ActiveOrdersScreen(
    orderStates: List<OrderDisplayState>,
    updatedOrderIds: Set<String>,
    preferences: KitchenPreferences,
    onMarkAsReady: (Order) -> Unit,
    onRemoveCancelled: (String) -> Unit = {}
) {
    // Split orders into cards based on max items preference
    val orderCards = orderStates.flatMap { orderState ->
        splitOrderIntoCards(orderState.order, preferences.maxItemsPerCard)
    }

    if (orderCards.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "🍳",
                    fontSize = 64.sp
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = "No hay órdenes activas",
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    } else {
        LazyVerticalGrid(
            columns = GridCells.Fixed(preferences.gridColumns),
            modifier = Modifier
                .fillMaxSize()
                .padding(8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(orderCards, key = { it.uniqueKey }) { cardData ->
                OrderCardDisplay(
                    cardData = cardData,
                    isUpdated = updatedOrderIds.contains(cardData.order.id),
                    preferences = preferences,
                    onMarkAsReady = onMarkAsReady
                )
            }
        }
    }
}

@Composable
fun OrderCardDisplay(
    cardData: OrderCardData,
    isUpdated: Boolean = false,
    preferences: KitchenPreferences,
    onMarkAsReady: (Order) -> Unit
) {
    val order = cardData.order
    val isContinuation = cardData.cardIndex > 0

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(preferences.cardHeight.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isUpdated) Color(0xFFFFF3E0) else MaterialTheme.colorScheme.surface
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp)
        ) {
            // Header - Only for first card or simplified for continuation
            if (!isContinuation) {
                // Full header for first card
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = when (order.type) {
                            "dine-in" -> "Mesa ${order.tableId ?: "?"}"
                            "takeout" -> if (order.takeoutNumber != null) "Pedido #${order.takeoutNumber}" else "Para Llevar"
                            else -> "Domicilio"
                        },
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = preferences.headerFontSize.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    Column(horizontalAlignment = Alignment.End) {
                        // Time badge
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer,
                            shape = MaterialTheme.shapes.extraSmall
                        ) {
                            Text(
                                text = formatTime(order.createdAt),
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }

                        // Modified badge
                        if (isUpdated) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Surface(
                                color = Color(0xFFFF6F00),
                                shape = MaterialTheme.shapes.extraSmall
                            ) {
                                Text(
                                    text = "MODIFICADO",
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color.White
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
                Divider(thickness = 2.dp)
                Spacer(modifier = Modifier.height(8.dp))
            } else {
                // Continuation header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = when (order.type) {
                                "dine-in" -> "Mesa ${order.tableId ?: "?"}"
                                "takeout" -> if (order.takeoutNumber != null) "Pedido #${order.takeoutNumber}" else "Para Llevar"
                                else -> "Domicilio"
                            },
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            fontSize = (preferences.headerFontSize - 4).sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Surface(
                            color = MaterialTheme.colorScheme.tertiaryContainer,
                            shape = MaterialTheme.shapes.extraSmall
                        ) {
                            Text(
                                text = "(Cont. ${cardData.cardIndex + 1}/${cardData.totalCards})",
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onTertiaryContainer
                            )
                        }
                    }

                    if (isUpdated) {
                        Surface(
                            color = Color(0xFFFF6F00),
                            shape = MaterialTheme.shapes.extraSmall
                        ) {
                            Text(
                                text = "MODIFICADO",
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color.White
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
                Divider(thickness = 1.dp)
                Spacer(modifier = Modifier.height(8.dp))
            }

            // Order Items
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                cardData.items.forEach { item ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.Top
                    ) {
                        // Quantity badge
                        Surface(
                            color = MaterialTheme.colorScheme.primary,
                            shape = MaterialTheme.shapes.extraSmall
                        ) {
                            Text(
                                text = "${item.quantity}",
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                color = Color.White,
                                fontSize = preferences.itemFontSize.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Spacer(modifier = Modifier.width(6.dp))

                        // Product name
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = item.product.name,
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                fontSize = preferences.itemFontSize.sp
                            )
                            // Modifiers
                            if (!item.modifiers.isNullOrEmpty()) {
                                item.modifiers.forEach { modifier ->
                                    Text(
                                        text = "  + ${modifier.modifier?.name ?: ""}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Medium,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                        fontSize = (preferences.itemFontSize - 2).sp
                                    )
                                }
                            }
                            // Notes
                            if (!item.notes.isNullOrBlank()) {
                                Text(
                                    text = item.notes,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Color(0xFFFF6F00),
                                    fontWeight = FontWeight.Medium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    fontSize = (preferences.itemFontSize - 2).sp
                                )
                            }
                        }
                    }
                }
            }

            // Order Notes if any (only on first card)
            if (!isContinuation && !order.notes.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Surface(
                    color = Color(0xFFFFF3E0),
                    shape = MaterialTheme.shapes.extraSmall
                ) {
                    Text(
                        text = order.notes,
                        modifier = Modifier.padding(6.dp),
                        fontSize = (preferences.itemFontSize - 2).sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Ready Button - Only on last card
            if (cardData.cardIndex == cardData.totalCards - 1) {
                Button(
                    onClick = { onMarkAsReady(order) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    ),
                    contentPadding = PaddingValues(vertical = 10.dp)
                ) {
                    Text(
                        text = "✓ LISTO",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            } else {
                // Arrow indicator for continuation
                Surface(
                    color = MaterialTheme.colorScheme.tertiaryContainer,
                    shape = MaterialTheme.shapes.extraSmall,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "↓ Continúa...",
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onTertiaryContainer,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
                }
            }
        }
    }
}

internal fun formatTime(timestamp: String): String {
    return try {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
        val date = sdf.parse(timestamp.split(".")[0])
        val timeFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
        timeFormat.format(date ?: Date())
    } catch (e: Exception) {
        "Ahora"
    }
}
