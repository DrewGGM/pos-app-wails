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
    val modifiers: List<Modifier>? = null,
    @SerializedName("has_variable_price") val hasVariablePrice: Boolean = false
)

// Cart Item (local state)
data class CartItem(
    val product: Product,
    val quantity: Int = 1,
    val notes: String = "",
    val modifiers: List<Modifier> = emptyList(),
    val customPrice: Double? = null  // For variable price products
) {
    // IMPORTANT: unitPrice should ONLY be the base product price (no modifiers)
    // Modifiers are added separately in subtotal calculation
    // This matches backend calculation in order_service.go:664-669
    val unitPrice: Double
        get() = customPrice ?: product.price  // Base product price only (no modifiers)

    val subtotal: Double
        get() {
            // Calculate base price * quantity
            val baseTotal = unitPrice * quantity
            // Add modifiers price changes * quantity
            val modifiersTotal = modifiers.sumOf { it.priceChange } * quantity
            return baseTotal + modifiersTotal
        }
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
    @SerializedName("order_type_id") val orderTypeId: Int? = null,
    val type: String, // "dine-in", "takeout" - Deprecated: use orderTypeId
    val status: String = "pending",
    @SerializedName("table_id") val tableId: Int? = null,
    val items: List<OrderItemRequest>,
    val subtotal: Double,
    val tax: Double,
    val total: Double,
    val notes: String? = null,
    val source: String = "waiter_app",
    @SerializedName("employee_id") val employeeId: Int = 1,
    // Delivery information (optional, for delivery orders)
    @SerializedName("delivery_customer_name") val deliveryCustomerName: String? = null,
    @SerializedName("delivery_address") val deliveryAddress: String? = null,
    @SerializedName("delivery_phone") val deliveryPhone: String? = null
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

// Order Type
data class OrderType(
    val id: Int,
    val code: String,
    val name: String,
    @SerializedName("requires_sequential_number") val requiresSequentialNumber: Boolean,
    @SerializedName("sequence_prefix") val sequencePrefix: String?,
    @SerializedName("display_color") val displayColor: String,
    val icon: String,
    @SerializedName("is_active") val isActive: Boolean,
    @SerializedName("display_order") val displayOrder: Int,
    @SerializedName("skip_payment_dialog") val skipPaymentDialog: Boolean = false,
    @SerializedName("default_payment_method_id") val defaultPaymentMethodId: Int? = null
)

// Custom Page (for POS product organization)
data class CustomPage(
    val id: Int,
    val name: String,
    val description: String,
    val icon: String,
    val color: String,
    @SerializedName("display_order") val displayOrder: Int,
    @SerializedName("is_active") val isActive: Boolean
)

// Order (for viewing)
data class OrderResponse(
    val id: Int,
    @SerializedName("order_number") val orderNumber: String,
    @SerializedName("order_type") val orderType: OrderType? = null,
    val type: String, // Deprecated: kept for backward compatibility
    val status: String,
    @SerializedName("sequence_number") val sequenceNumber: Int? = null,
    @SerializedName("takeout_number") val takeoutNumber: Int? = null, // Deprecated
    @SerializedName("table_id") val tableId: Int?,
    @SerializedName("table_number") val tableNumber: String?,
    @SerializedName("table") val table: Table? = null,
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
