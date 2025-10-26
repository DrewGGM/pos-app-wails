package com.drewcore.waiter_app.data.models

import com.google.gson.annotations.SerializedName

// Product
data class Product(
    val id: Int,
    val name: String,
    val price: Double,
    val category: String? = null,
    @SerializedName("image_url") val imageUrl: String? = null,
    val stock: Int = 0,
    val available: Boolean = true
)

// Cart Item (local state)
data class CartItem(
    val product: Product,
    var quantity: Int = 1,
    var notes: String = ""
) {
    val subtotal: Double
        get() = product.price * quantity
}

// Order Item for sending to server
data class OrderItemRequest(
    @SerializedName("product_id") val productId: Int,
    val quantity: Int,
    val price: Double,
    val subtotal: Double,
    val notes: String? = null
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
    val status: String
)
