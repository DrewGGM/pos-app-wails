package com.drewcore.kitchen_app.data.database

import androidx.room.ColumnInfo
import androidx.room.Embedded
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Relation
import com.drewcore.kitchen_app.data.models.*

@Entity(tableName = "orders")
data class OrderEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String,

    @ColumnInfo(name = "order_number")
    val orderNumber: String,

    @ColumnInfo(name = "type")
    val type: String,

    @ColumnInfo(name = "status")
    val status: String,

    @ColumnInfo(name = "sequence_number")
    val sequenceNumber: Int?,

    @ColumnInfo(name = "takeout_number")
    val takeoutNumber: Int?,

    @ColumnInfo(name = "table_id")
    val tableId: String?,

    @ColumnInfo(name = "table_number")
    val tableNumber: Int?,

    @ColumnInfo(name = "order_type_id")
    val orderTypeId: Int?,

    @ColumnInfo(name = "order_type_code")
    val orderTypeCode: String?,

    @ColumnInfo(name = "order_type_name")
    val orderTypeName: String?,

    @ColumnInfo(name = "subtotal")
    val subtotal: Double,

    @ColumnInfo(name = "tax")
    val tax: Double,

    @ColumnInfo(name = "total")
    val total: Double,

    @ColumnInfo(name = "notes")
    val notes: String?,

    @ColumnInfo(name = "source")
    val source: String,

    @ColumnInfo(name = "created_at")
    val createdAt: String,

    @ColumnInfo(name = "updated_at")
    val updatedAt: String,

    @ColumnInfo(name = "is_completed")
    val isCompleted: Boolean = false,

    @ColumnInfo(name = "completed_at")
    val completedAt: Long? = null
)

@Entity(tableName = "order_items")
data class OrderItemEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String,

    @ColumnInfo(name = "order_id")
    val orderId: String,

    @ColumnInfo(name = "product_id")
    val productId: String,

    @ColumnInfo(name = "product_name")
    val productName: String,

    @ColumnInfo(name = "product_price")
    val productPrice: Double,

    @ColumnInfo(name = "product_category")
    val productCategory: String?,

    @ColumnInfo(name = "quantity")
    val quantity: Int,

    @ColumnInfo(name = "price")
    val price: Double,

    @ColumnInfo(name = "subtotal")
    val subtotal: Double,

    @ColumnInfo(name = "notes")
    val notes: String?
)

data class OrderWithItems(
    @Embedded
    val order: OrderEntity,

    @Relation(
        parentColumn = "id",
        entityColumn = "order_id"
    )
    val items: List<OrderItemEntity>
)

// Extension functions to convert between Room entities and data models
fun OrderWithItems.toOrder(): Order {
    val table = if (order.tableId != null && order.tableNumber != null) {
        Table(
            id = order.tableId,
            number = order.tableNumber,
            status = "occupied"
        )
    } else null

    val orderType = if (order.orderTypeId != null && order.orderTypeCode != null && order.orderTypeName != null) {
        OrderType(
            id = order.orderTypeId,
            code = order.orderTypeCode,
            name = order.orderTypeName,
            requiresSequentialNumber = true,
            sequencePrefix = null,
            displayColor = "#000000",
            icon = "",
            isActive = true
        )
    } else null

    val orderItems = items.map { it.toOrderItem() }

    return Order(
        id = order.id,
        orderNumber = order.orderNumber,
        orderType = orderType,
        type = order.type,
        status = order.status,
        sequenceNumber = order.sequenceNumber,
        takeoutNumber = order.takeoutNumber,
        tableId = order.tableId,
        table = table,
        items = orderItems,
        subtotal = order.subtotal,
        tax = order.tax,
        total = order.total,
        notes = order.notes,
        source = order.source,
        createdAt = order.createdAt,
        updatedAt = order.updatedAt
    )
}

fun OrderItemEntity.toOrderItem(): OrderItem {
    return OrderItem(
        id = id,
        productId = productId,
        product = Product(
            id = productId,
            name = productName,
            price = productPrice,
            category = productCategory
        ),
        quantity = quantity,
        price = price,
        subtotal = subtotal,
        notes = notes,
        modifiers = null
    )
}

fun Order.toOrderEntity(isCompleted: Boolean = false, completedAt: Long? = null): OrderEntity {
    return OrderEntity(
        id = id,
        orderNumber = orderNumber,
        type = type,
        status = status,
        sequenceNumber = sequenceNumber,
        takeoutNumber = takeoutNumber,
        tableId = tableId,
        tableNumber = table?.number,
        orderTypeId = orderType?.id,
        orderTypeCode = orderType?.code,
        orderTypeName = orderType?.name,
        subtotal = subtotal,
        tax = tax,
        total = total,
        notes = notes,
        source = source,
        createdAt = createdAt,
        updatedAt = updatedAt,
        isCompleted = isCompleted,
        completedAt = completedAt
    )
}

fun OrderItem.toOrderItemEntity(orderId: String): OrderItemEntity {
    return OrderItemEntity(
        id = id,
        orderId = orderId,
        productId = productId,
        productName = product.name,
        productPrice = product.price,
        productCategory = product.category,
        quantity = quantity,
        price = price,
        subtotal = subtotal,
        notes = notes
    )
}
