package com.drewcore.kitchen_app.data.repository

import android.content.Context
import com.drewcore.kitchen_app.data.database.*
import com.drewcore.kitchen_app.data.models.Order
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import java.util.Calendar

class OrderRepository(context: Context) {
    private val database = KitchenDatabase.getDatabase(context)
    private val orderDao = database.orderDao()

    // Flow of active orders
    val activeOrders: Flow<List<Order>> = orderDao.getActiveOrdersFlow()
        .map { orderWithItemsList ->
            orderWithItemsList.map { it.toOrder() }
        }

    // Flow of completed orders
    val completedOrders: Flow<List<Order>> = orderDao.getCompletedOrdersFlow()
        .map { orderWithItemsList ->
            orderWithItemsList.map { it.toOrder() }
        }

    // Insert or update an active order
    suspend fun insertActiveOrder(order: Order) {
        val orderEntity = order.toOrderEntity(isCompleted = false)
        val itemEntities = order.items.map { it.toOrderItemEntity(order.id) }
        orderDao.insertOrderWithItems(orderEntity, itemEntities)
    }

    // Mark order as completed
    suspend fun markOrderAsCompleted(orderId: String) {
        val completedAt = System.currentTimeMillis()
        orderDao.markOrderAsCompleted(orderId, completedAt)
    }

    // Undo order completion (move back to active)
    suspend fun undoOrderCompletion(orderId: String) {
        orderDao.markOrderAsActive(orderId)
    }

    // Delete order permanently
    suspend fun deleteOrder(orderId: String) {
        orderDao.deleteOrderWithItems(orderId)
    }

    // Update order status
    suspend fun updateOrderStatus(orderId: String, status: String, updatedAt: String) {
        orderDao.updateOrderStatus(orderId, status, updatedAt)
    }

    // Get specific order
    suspend fun getOrderById(orderId: String): Order? {
        return orderDao.getOrderById(orderId)?.toOrder()
    }

    // Daily cleanup - removes completed orders older than 24 hours
    suspend fun performDailyCleanup(): Int {
        val calendar = Calendar.getInstance()
        calendar.add(Calendar.HOUR_OF_DAY, -24)
        val cutoffTimestamp = calendar.timeInMillis
        return orderDao.cleanupOldCompletedOrders(cutoffTimestamp)
    }

    // Clear all data (for testing/reset)
    suspend fun clearAllOrders() {
        orderDao.deleteAllOrderItems()
        orderDao.deleteAllOrders()
    }

    // Get counts
    suspend fun getActiveOrderCount(): Int = orderDao.getActiveOrderCount()
    suspend fun getCompletedOrderCount(): Int = orderDao.getCompletedOrderCount()
}
