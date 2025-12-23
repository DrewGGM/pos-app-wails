package com.drewcore.kitchen_app.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drewcore.kitchen_app.data.models.ItemChangeStatus
import com.drewcore.kitchen_app.data.models.Order
import com.drewcore.kitchen_app.data.models.OrderItem
import com.drewcore.kitchen_app.data.models.OrderDisplayState
import com.drewcore.kitchen_app.data.preferences.KitchenPreferences
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.abs

// Data class to represent a display card (can be original order or continuation)
data class OrderCardData(
    val order: Order,
    val items: List<OrderItem>,
    val cardIndex: Int, // 0 for first card, 1+ for continuations
    val totalCards: Int,
    val uniqueKey: String,
    val isCancelled: Boolean = false
)

// Helper function to get order title based on order type
fun getOrderTitle(order: Order): String {
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
            "dine_in", "dine-in" -> if (order.table != null) "Mesa ${order.table.number}" else "Mesa ${order.tableId ?: "?"}"
            "takeout" -> if (order.takeoutNumber != null) "Pedido #${order.takeoutNumber}" else "Para Llevar"
            "delivery" -> "Domicilio"
            else -> "Pedido"
        }
    }
}

// Calculate elapsed time in minutes
fun calculateElapsedMinutes(timestamp: String): Long {
    return try {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
        val orderDate = sdf.parse(timestamp.split(".")[0])
        val now = Date()
        val diffMs = abs(now.time - (orderDate?.time ?: 0))
        diffMs / (60 * 1000) // Convert to minutes
    } catch (e: Exception) {
        0
    }
}

// Composable for elapsed time timer with color coding
@Composable
fun OrderTimer(createdAt: String) {
    var elapsedMinutes by remember { mutableStateOf(calculateElapsedMinutes(createdAt)) }

    // Update every 30 seconds
    LaunchedEffect(createdAt) {
        while (true) {
            delay(30000) // 30 seconds
            elapsedMinutes = calculateElapsedMinutes(createdAt)
        }
    }

    // Determine color based on elapsed time
    val (backgroundColor, textColor) = when {
        elapsedMinutes < 5 -> Color(0xFF4CAF50) to Color.White // Green
        elapsedMinutes < 10 -> Color(0xFFFFC107) to Color.Black // Yellow
        else -> Color(0xFFE53935) to Color.White // Red
    }

    // Format time display
    val timeText = when {
        elapsedMinutes < 60 -> "${elapsedMinutes}m"
        else -> {
            val hours = elapsedMinutes / 60
            val mins = elapsedMinutes % 60
            "${hours}h ${mins}m"
        }
    }

    Surface(
        color = backgroundColor,
        shape = MaterialTheme.shapes.extraSmall
    ) {
        Text(
            text = timeText,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = textColor
        )
    }
}

// Split an order into multiple cards if needed
fun splitOrderIntoCards(order: Order, maxItemsPerCard: Int, isCancelled: Boolean = false): List<OrderCardData> {
    if (order.items.size <= maxItemsPerCard) {
        // Order fits in one card
        return listOf(
            OrderCardData(
                order = order,
                items = order.items,
                cardIndex = 0,
                totalCards = 1,
                uniqueKey = order.id,
                isCancelled = isCancelled
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
                uniqueKey = "${order.id}_$index",
                isCancelled = isCancelled
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
    // Split orders into cards based on max items preference, passing cancelled state
    val orderCards = orderStates.flatMap { orderState ->
        splitOrderIntoCards(orderState.order, preferences.maxItemsPerCard, orderState.isCancelled)
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
                    onMarkAsReady = onMarkAsReady,
                    onRemoveCancelled = onRemoveCancelled
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
    onMarkAsReady: (Order) -> Unit,
    onRemoveCancelled: (String) -> Unit = {}
) {
    val order = cardData.order
    val isContinuation = cardData.cardIndex > 0
    val isCancelled = cardData.isCancelled

    // Determine card background color based on state
    val cardBackgroundColor = when {
        isCancelled -> Color(0xFFFFEBEE) // Light red for cancelled
        isUpdated -> Color(0xFFFFF3E0)   // Light orange for updated
        else -> MaterialTheme.colorScheme.surface
    }

    // Border for cancelled orders
    val cardBorder = if (isCancelled) {
        androidx.compose.foundation.BorderStroke(3.dp, Color(0xFFE53935))
    } else {
        null
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(preferences.cardHeight.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = if (isCancelled) 2.dp else 6.dp),
        colors = CardDefaults.cardColors(containerColor = cardBackgroundColor),
        border = cardBorder
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp)
        ) {
            // Header - Only for first card or simplified for continuation
            if (!isContinuation) {
                // Full header for first card - Fixed height to prevent overflow
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(IntrinsicSize.Min),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Title with weight to take available space
                    Text(
                        text = getOrderTitle(order),
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = preferences.headerFontSize.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    // Badges in horizontal row (compact layout)
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Cancelled badge (high priority)
                        if (isCancelled) {
                            Surface(
                                color = Color(0xFFE53935),
                                shape = MaterialTheme.shapes.extraSmall
                            ) {
                                Text(
                                    text = "CANCELADO",
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color.White
                                )
                            }
                        } else if (isUpdated) {
                            // Modified badge (compact) - only show if not cancelled
                            Surface(
                                color = Color(0xFFFF6F00),
                                shape = MaterialTheme.shapes.extraSmall
                            ) {
                                Text(
                                    text = "MOD",
                                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 3.dp),
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = Color.White
                                )
                            }
                        }

                        // Elapsed time timer (hide for cancelled)
                        if (!isCancelled) {
                            OrderTimer(createdAt = order.createdAt)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))
                Divider(thickness = 2.dp)
                Spacer(modifier = Modifier.height(6.dp))
            } else {
                // Continuation header - compact layout
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(IntrinsicSize.Min),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Title with weight
                    Text(
                        text = getOrderTitle(order),
                        modifier = Modifier.weight(1f, fill = false),
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        fontSize = (preferences.headerFontSize - 4).sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )

                    // Continuation badge
                    Surface(
                        color = if (isCancelled) Color(0xFFE53935).copy(alpha = 0.2f) else MaterialTheme.colorScheme.tertiaryContainer,
                        shape = MaterialTheme.shapes.extraSmall
                    ) {
                        Text(
                            text = "${cardData.cardIndex + 1}/${cardData.totalCards}",
                            modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isCancelled) Color(0xFFE53935) else MaterialTheme.colorScheme.onTertiaryContainer
                        )
                    }

                    // Cancelled or Modified badge
                    if (isCancelled) {
                        Surface(
                            color = Color(0xFFE53935),
                            shape = MaterialTheme.shapes.extraSmall
                        ) {
                            Text(
                                text = "CANCELADO",
                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                                fontSize = 9.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color.White
                            )
                        }
                    } else if (isUpdated) {
                        Surface(
                            color = Color(0xFFFF6F00),
                            shape = MaterialTheme.shapes.extraSmall
                        ) {
                            Text(
                                text = "MOD",
                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                                fontSize = 9.sp,
                                fontWeight = FontWeight.ExtraBold,
                                color = Color.White
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))
                Divider(thickness = 1.dp)
                Spacer(modifier = Modifier.height(6.dp))
            }

            // Order Items with scroll indicator
            val scrollState = rememberScrollState()
            val canScrollDown = scrollState.canScrollForward
            val canScrollUp = scrollState.canScrollBackward
            val hasScrollContent = canScrollDown || canScrollUp

            // Custom scroll indicator color based on card state
            val scrollIndicatorColor = when {
                isCancelled -> Color(0xFFE53935)
                else -> MaterialTheme.colorScheme.primary
            }

            // Main content column with scroll
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(scrollState)
                    // Draw custom scrollbar when scrollable
                    .drawWithContent {
                        drawContent()

                        // Draw scrollbar only if there's scrollable content
                        if (hasScrollContent) {
                            val scrollBarHeight = size.height * (size.height / (size.height + scrollState.maxValue.toFloat()))
                            val scrollBarY = (scrollState.value.toFloat() / scrollState.maxValue.toFloat()) * (size.height - scrollBarHeight)

                            // Scrollbar track (light background)
                            drawRect(
                                color = Color.LightGray.copy(alpha = 0.3f),
                                topLeft = Offset(size.width - 6.dp.toPx(), 0f),
                                size = Size(4.dp.toPx(), size.height)
                            )

                            // Scrollbar thumb (visible indicator)
                            drawRect(
                                color = scrollIndicatorColor.copy(alpha = 0.8f),
                                topLeft = Offset(size.width - 6.dp.toPx(), scrollBarY),
                                size = Size(4.dp.toPx(), scrollBarHeight.coerceAtLeast(24.dp.toPx()))
                            )
                        }
                    }
                    .padding(end = if (hasScrollContent) 10.dp else 0.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                cardData.items.forEach { item ->
                    // Determine colors and styles based on item change status
                    // If order is cancelled, treat ALL items as removed
                    val isRemoved = isCancelled || item.changeStatus == ItemChangeStatus.REMOVED
                    val isAdded = !isCancelled && item.changeStatus == ItemChangeStatus.ADDED
                    val isModified = !isCancelled && item.changeStatus == ItemChangeStatus.MODIFIED

                    val badgeColor = when {
                        isRemoved -> Color(0xFFE53935) // Red for removed/cancelled
                        isAdded -> Color(0xFF4CAF50)   // Green for added
                        isModified -> Color(0xFFFF9800) // Orange for modified
                        else -> MaterialTheme.colorScheme.primary
                    }

                    val textColor = when {
                        isRemoved -> Color(0xFFE53935).copy(alpha = 0.7f)
                        else -> Color.Unspecified
                    }

                    val textDecoration = if (isRemoved) TextDecoration.LineThrough else TextDecoration.None

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .then(
                                if (isRemoved) Modifier.padding(vertical = 2.dp) else Modifier
                            ),
                        verticalAlignment = Alignment.Top
                    ) {
                        // Quantity badge with status indicator
                        Surface(
                            color = badgeColor,
                            shape = MaterialTheme.shapes.extraSmall
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                // Status prefix for removed items
                                if (isRemoved) {
                                    Text(
                                        text = "X ",
                                        color = Color.White,
                                        fontSize = (preferences.itemFontSize - 2).sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                Text(
                                    text = "${item.quantity}",
                                    color = Color.White,
                                    fontSize = preferences.itemFontSize.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
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
                                fontSize = preferences.itemFontSize.sp,
                                color = textColor,
                                textDecoration = textDecoration
                            )
                            // Modifiers
                            if (!item.modifiers.isNullOrEmpty()) {
                                item.modifiers.forEach { modifier ->
                                    Text(
                                        text = "  + ${modifier.modifier?.name ?: ""}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = if (isRemoved) textColor else MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Medium,
                                        fontSize = (preferences.itemFontSize - 2).sp,
                                        textDecoration = textDecoration
                                    )
                                }
                            }
                            // Notes
                            if (!item.notes.isNullOrBlank()) {
                                Text(
                                    text = "📝 ${item.notes}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (isRemoved) textColor else Color(0xFFFF6F00),
                                    fontWeight = FontWeight.Medium,
                                    fontSize = (preferences.itemFontSize - 2).sp,
                                    textDecoration = textDecoration
                                )
                            }
                        }

                        // Status indicator badge on the right
                        if (isAdded || isModified) {
                            Spacer(modifier = Modifier.width(4.dp))
                            Surface(
                                color = badgeColor.copy(alpha = 0.2f),
                                shape = MaterialTheme.shapes.extraSmall
                            ) {
                                Text(
                                    text = if (isAdded) "+" else "~",
                                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = badgeColor
                                )
                            }
                        }
                    }
                }
            }

            // Scroll indicator at bottom when more content below
            AnimatedVisibility(
                visible = canScrollDown,
                enter = fadeIn(tween(200)),
                exit = fadeOut(tween(200))
            ) {
                Surface(
                    color = scrollIndicatorColor,
                    shape = MaterialTheme.shapes.extraSmall,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "↓ más contenido ↓",
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                    )
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

            // Ready Button or Remove Button - Only on last card
            if (cardData.cardIndex == cardData.totalCards - 1) {
                if (isCancelled) {
                    // Remove button for cancelled orders
                    Button(
                        onClick = { onRemoveCancelled(order.id) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFE53935)
                        ),
                        contentPadding = PaddingValues(vertical = 10.dp)
                    ) {
                        Text(
                            text = "✕ QUITAR",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                } else {
                    // Ready button for active orders
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
                }
            } else {
                // Arrow indicator for continuation
                Surface(
                    color = if (isCancelled) Color(0xFFE53935).copy(alpha = 0.2f) else MaterialTheme.colorScheme.tertiaryContainer,
                    shape = MaterialTheme.shapes.extraSmall,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text(
                        text = "↓ Continúa...",
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isCancelled) Color(0xFFE53935) else MaterialTheme.colorScheme.onTertiaryContainer,
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
