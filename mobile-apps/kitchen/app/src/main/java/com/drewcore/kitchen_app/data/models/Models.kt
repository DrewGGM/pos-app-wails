package com.drewcore.kitchen_app.data.models

import com.google.gson.annotations.SerializedName
import java.util.Date

// WebSocket Message Types
enum class MessageType(val value: String) {
    @SerializedName("order_new") ORDER_NEW("order_new"),
    @SerializedName("order_update") ORDER_UPDATE("order_update"),
    @SerializedName("order_ready") ORDER_READY("order_ready"),
    @SerializedName("order_cancelled") ORDER_CANCELLED("order_cancelled"),
    @SerializedName("kitchen_order") KITCHEN_ORDER("kitchen_order"),
    @SerializedName("kitchen_update") KITCHEN_UPDATE("kitchen_update"),
    @SerializedName("heartbeat") HEARTBEAT("heartbeat"),
    @SerializedName("auth_response") AUTH_RESPONSE("auth_response")
}

// WebSocket Message
data class WebSocketMessage(
    val type: String,
    @SerializedName("client_id") val clientId: String? = null,
    val timestamp: String,
    val data: Map<String, Any>
)

// Order Status
enum class OrderStatus(val value: String) {
    @SerializedName("pending") PENDING("pending"),
    @SerializedName("preparing") PREPARING("preparing"),
    @SerializedName("ready") READY("ready"),
    @SerializedName("delivered") DELIVERED("delivered"),
    @SerializedName("cancelled") CANCELLED("cancelled")
}

// Modifier
data class Modifier(
    val id: String,
    val name: String,
    @SerializedName("price_change") val priceChange: Double
)

// Order Item Modifier
data class OrderItemModifier(
    @SerializedName("modifier_id") val modifierId: String,
    val modifier: Modifier?,
    @SerializedName("price_change") val priceChange: Double
)

// Product
data class Product(
    val id: String,
    val name: String,
    val price: Double,
    val category: String? = null,
    @SerializedName("image_url") val imageUrl: String? = null
)

// Table
data class Table(
    val id: String,
    val number: Int,
    val status: String
)

// Order Type
data class OrderType(
    val id: Int,
    val code: String,
    val name: String,
    @SerializedName("requires_sequential_number") val requiresSequentialNumber: Boolean,
    @SerializedName("sequence_prefix") val sequencePrefix: String?,
    @SerializedName("display_color") val displayColor: String,
    val icon: String,
    @SerializedName("is_active") val isActive: Boolean
)

// Order Item Change Status
enum class ItemChangeStatus {
    UNCHANGED,  // Item existed before
    ADDED,      // New item
    REMOVED,    // Item was in previous version but not in current
    MODIFIED    // Item quantity or notes changed
}

// Order Item
data class OrderItem(
    val id: String,
    @SerializedName("product_id") val productId: String,
    val product: Product,
    val quantity: Int,
    val price: Double,
    val subtotal: Double,
    val notes: String? = null,
    val modifiers: List<OrderItemModifier>? = null,
    // Local metadata - included in constructor for proper copy() behavior
    @Transient var changeStatus: ItemChangeStatus = ItemChangeStatus.UNCHANGED,
    @Transient var previousQuantity: Int? = null
)

// Order
data class Order(
    val id: String,
    @SerializedName("order_number") val orderNumber: String,
    @SerializedName("order_type") val orderType: OrderType? = null,
    val type: String, // "dine_in", "takeout", "delivery" - Deprecated: use orderType
    val status: String,
    @SerializedName("sequence_number") val sequenceNumber: Int? = null,
    @SerializedName("takeout_number") val takeoutNumber: Int? = null, // Deprecated: use sequenceNumber
    @SerializedName("table_id") val tableId: String? = null,
    val table: Table? = null,
    val items: List<OrderItem>,
    val subtotal: Double,
    val tax: Double,
    val total: Double,
    val notes: String? = null,
    val source: String, // "pos", "waiter_app"
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String
) {
    // Helper method to compare items
    // Uses item ID as primary key for comparison to properly handle note/comment changes
    fun hasChangedItemsFrom(other: Order): Boolean {
        if (this.items.size != other.items.size) return true

        // First try to match by item ID (for existing items that were updated)
        val thisItemsById = this.items.associateBy { it.id }
        val otherItemsById = other.items.associateBy { it.id }

        // Check if items were modified (same ID but different data)
        for ((id, thisItem) in thisItemsById) {
            val otherItem = otherItemsById[id]
            if (otherItem != null) {
                // Same item exists, check if quantity or notes changed
                if (otherItem.quantity != thisItem.quantity ||
                    otherItem.notes != thisItem.notes) {
                    return true
                }
            }
        }

        // Fallback: compare by productId for items without matching IDs
        // This handles cases where backend recreates items with new IDs
        val thisProductGroups = this.items.groupBy { it.productId }
        val otherProductGroups = other.items.groupBy { it.productId }

        // Check if product composition changed
        if (thisProductGroups.keys != otherProductGroups.keys) return true

        // Check total quantities per product
        for ((productId, thisItems) in thisProductGroups) {
            val otherItems = otherProductGroups[productId] ?: return true
            val thisTotalQty = thisItems.sumOf { it.quantity }
            val otherTotalQty = otherItems.sumOf { it.quantity }
            if (thisTotalQty != otherTotalQty) return true

            // Check if notes changed for this product (any note difference is a change)
            val thisNotes = thisItems.map { it.notes ?: "" }.sorted()
            val otherNotes = otherItems.map { it.notes ?: "" }.sorted()
            if (thisNotes != otherNotes) return true
        }

        return false
    }
}

// Auth Response
data class AuthResponse(
    val success: Boolean,
    val message: String,
    @SerializedName("client_id") val clientId: String
)

// Order Display State (for cancelled orders with countdown)
data class OrderDisplayState(
    val order: Order,
    val isCancelled: Boolean = false,
    val cancelledAtMs: Long? = null
)
