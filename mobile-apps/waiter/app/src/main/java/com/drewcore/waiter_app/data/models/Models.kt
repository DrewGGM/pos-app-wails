package com.drewcore.waiter_app.data.models

import com.google.gson.annotations.SerializedName

// Modifier
data class Modifier(
    val id: Int,
    val name: String,
    @SerializedName("price_change") val priceChange: Double
)

// Order Item Modifier
data class OrderItemModifier(
    @SerializedName("modifier_id") val modifierId: Int,
    val modifier: Modifier?,
    @SerializedName("price_change") val priceChange: Double
)

// Product
data class Product(
    val id: Int,
    val name: String,
    val price: Double,
    val category: String? = null,
    @SerializedName("image_url") val imageUrl: String? = null,
    val stock: Int = 0,
    val available: Boolean = true,
    val modifiers: List<Modifier>? = null
)

// Cart Item (local state)
data class CartItem(
    val product: Product,
    val quantity: Int = 1,
    val notes: String = "",
    val modifiers: List<Modifier> = emptyList()
) {
    val unitPrice: Double
        get() = product.price + modifiers.sumOf { it.priceChange }

    val subtotal: Double
        get() = unitPrice * quantity
}

// Order Item for sending to server
data class OrderItemRequest(
    @SerializedName("product_id") val productId: Int,
    val quantity: Int,
    @SerializedName("unit_price") val unitPrice: Double,
    val subtotal: Double,
    val notes: String? = null,
    val modifiers: List<OrderItemModifierRequest>? = null
)

// Order Item Modifier for sending to server
data class OrderItemModifierRequest(
    @SerializedName("modifier_id") val modifierId: Int,
    @SerializedName("price_change") val priceChange: Double
)

// Order Request
data class OrderRequest(
    @SerializedName("order_number") val orderNumber: String,
    val type: String, // "dine-in", "takeout"
    val status: String = "pending",
    @SerializedName("table_id") val tableId: Int? = null,
    val items: List<OrderItemRequest>,
    val subtotal: Double,
    val tax: Double,
    val total: Double,
    val notes: String? = null,
    val source: String = "waiter_app",
    @SerializedName("employee_id") val employeeId: Int = 1
)

// WebSocket Message
data class WebSocketMessage(
    val type: String,
    @SerializedName("client_id") val clientId: String? = null,
    val timestamp: String,
    val data: Any
)

// Auth Response
data class AuthResponse(
    val success: Boolean,
    val message: String,
    @SerializedName("client_id") val clientId: String
)

// Table
data class Table(
    val id: Int,
    val number: String,
    val name: String,
    val capacity: Int,
    val status: String, // "available", "occupied", "reserved"
    val zone: String
)

// Order (for viewing)
data class OrderResponse(
    val id: Int,
    @SerializedName("order_number") val orderNumber: String,
    val type: String,
    val status: String,
    @SerializedName("takeout_number") val takeoutNumber: Int? = null,
    @SerializedName("table_id") val tableId: Int?,
    @SerializedName("table_number") val tableNumber: String?,
    val items: List<OrderItemDetail>,
    val subtotal: Double,
    val tax: Double,
    val total: Double,
    val notes: String?,
    val source: String,
    @SerializedName("created_at") val createdAt: String
)

data class OrderItemDetail(
    @SerializedName("product_id") val productId: Int,
    @SerializedName("product_name") val productName: String,
    val quantity: Int,
    @SerializedName("unit_price") val unitPrice: Double,
    val subtotal: Double,
    val notes: String?,
    val status: String,
    val modifiers: List<OrderItemModifier>? = null
)
