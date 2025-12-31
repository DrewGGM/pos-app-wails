package com.drewcore.kitchen_app.data.database

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface OrderDao {
    // Insert operations
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrder(order: OrderEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrderItems(items: List<OrderItemEntity>)

    @Transaction
    suspend fun insertOrderWithItems(order: OrderEntity, items: List<OrderItemEntity>) {
        insertOrder(order)
        insertOrderItems(items)
    }

    // Query active orders (not completed)
    @Transaction
    @Query("SELECT * FROM orders WHERE is_completed = 0 ORDER BY created_at DESC")
    fun getActiveOrdersFlow(): Flow<List<OrderWithItems>>

    @Transaction
    @Query("SELECT * FROM orders WHERE is_completed = 0 ORDER BY created_at DESC")
    suspend fun getActiveOrders(): List<OrderWithItems>

    // Query completed orders
    @Transaction
    @Query("SELECT * FROM orders WHERE is_completed = 1 ORDER BY completed_at DESC")
    fun getCompletedOrdersFlow(): Flow<List<OrderWithItems>>

    @Transaction
    @Query("SELECT * FROM orders WHERE is_completed = 1 ORDER BY completed_at DESC")
    suspend fun getCompletedOrders(): List<OrderWithItems>

    // Get specific order
    @Transaction
    @Query("SELECT * FROM orders WHERE id = :orderId LIMIT 1")
    suspend fun getOrderById(orderId: String): OrderWithItems?

    // Update order status
    @Query("UPDATE orders SET status = :status, updated_at = :updatedAt WHERE id = :orderId")
    suspend fun updateOrderStatus(orderId: String, status: String, updatedAt: String)

    // Mark order as completed
    @Query("UPDATE orders SET is_completed = 1, completed_at = :completedAt WHERE id = :orderId")
    suspend fun markOrderAsCompleted(orderId: String, completedAt: Long)

    // Mark order as active (undo completion)
    @Query("UPDATE orders SET is_completed = 0, completed_at = NULL WHERE id = :orderId")
    suspend fun markOrderAsActive(orderId: String)

    // Delete operations
    @Query("DELETE FROM orders WHERE id = :orderId")
    suspend fun deleteOrder(orderId: String)

    @Query("DELETE FROM order_items WHERE order_id = :orderId")
    suspend fun deleteOrderItems(orderId: String)

    @Transaction
    suspend fun deleteOrderWithItems(orderId: String) {
        deleteOrderItems(orderId)
        deleteOrder(orderId)
    }

    // Daily cleanup - delete completed orders older than specified timestamp
    @Query("DELETE FROM orders WHERE is_completed = 1 AND completed_at < :timestamp")
    suspend fun deleteCompletedOrdersOlderThan(timestamp: Long): Int

    @Query("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE is_completed = 1 AND completed_at < :timestamp)")
    suspend fun deleteCompletedOrderItemsOlderThan(timestamp: Long): Int

    @Transaction
    suspend fun cleanupOldCompletedOrders(timestamp: Long): Int {
        deleteCompletedOrderItemsOlderThan(timestamp)
        return deleteCompletedOrdersOlderThan(timestamp)
    }

    // Count operations
    @Query("SELECT COUNT(*) FROM orders WHERE is_completed = 0")
    suspend fun getActiveOrderCount(): Int

    @Query("SELECT COUNT(*) FROM orders WHERE is_completed = 1")
    suspend fun getCompletedOrderCount(): Int

    // Clear all orders (for testing/reset)
    @Query("DELETE FROM orders")
    suspend fun deleteAllOrders()

    @Query("DELETE FROM order_items")
    suspend fun deleteAllOrderItems()
}
