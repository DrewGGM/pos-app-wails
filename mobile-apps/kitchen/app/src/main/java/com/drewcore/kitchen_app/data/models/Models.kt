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
    val modifiers: List<OrderItemModifier>? = null
) {
    // Local metadata (not serialized)
    @Transient var changeStatus: ItemChangeStatus = ItemChangeStatus.UNCHANGED
    @Transient var previousQuantity: Int? = null
}

// Order
data class Order(
    val id: String,
    @SerializedName("order_number") val orderNumber: String,
    val type: String, // "dine-in", "takeout", "delivery"
    val status: String,
    @SerializedName("takeout_number") val takeoutNumber: Int? = null,
    @SerializedName("table_id") val tableId: String? = null,
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
    fun hasChangedItemsFrom(other: Order): Boolean {
        if (this.items.size != other.items.size) return true

        val thisItemsMap = this.items.associateBy { "${it.productId}-${it.notes}" }
        val otherItemsMap = other.items.associateBy { "${it.productId}-${it.notes}" }

        // Check if any item is different
        for ((key, thisItem) in thisItemsMap) {
            val otherItem = otherItemsMap[key]
            if (otherItem == null || otherItem.quantity != thisItem.quantity) {
                return true
            }
        }

        // Check if other has items this doesn't have
        return otherItemsMap.keys != thisItemsMap.keys
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
