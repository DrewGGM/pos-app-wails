package com.drewcore.waiter_app.data.network

import android.util.Log
import com.drewcore.waiter_app.data.models.OrderRequest
import com.drewcore.waiter_app.data.models.Product
import com.drewcore.waiter_app.data.models.TableArea
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

data class OrderCreateResponse(
    val success: Boolean,
    val order_id: Int,
    val order_number: String
)

class PosApiService(private val serverIp: String) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()

    companion object {
        private const val TAG = "PosApiService"
        private const val PORT = 8080
    }

    /**
     * Fetches available products from POS server
     */
    suspend fun getProducts(): Result<List<Product>> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$serverIp:$PORT/api/products"
            val request = Request.Builder()
                .url(url)
                .get()
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                val body = response.body?.string()
                val type = object : TypeToken<List<Product>>() {}.type
                val products = gson.fromJson<List<Product>>(body, type)
                Result.success(products)
            } else {
                Result.failure(Exception("Error fetching products: ${response.code}"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching products", e)
            Result.failure(e)
        }
    }

    /**
     * Sends a new order to POS server
     * Returns OrderCreateResponse with order_id and order_number
     */
    suspend fun createOrder(order: OrderRequest): Result<OrderCreateResponse> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$serverIp:$PORT/api/orders"
            val json = gson.toJson(order)
            val mediaType = "application/json; charset=utf-8".toMediaType()
            val requestBody = json.toRequestBody(mediaType)

            val request = Request.Builder()
                .url(url)
                .post(requestBody)
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                val responseBody = response.body?.string()
                val orderResponse = gson.fromJson(responseBody, OrderCreateResponse::class.java)
                Result.success(orderResponse)
            } else {
                val error = response.body?.string() ?: "Unknown error"
                Result.failure(Exception("Error creating order: $error"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error creating order", e)
            Result.failure(e)
        }
    }

    /**
     * Fetches active order types from POS server
     */
    suspend fun getOrderTypes(): Result<List<com.drewcore.waiter_app.data.models.OrderType>> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$serverIp:$PORT/api/order-types/active"
            val request = Request.Builder()
                .url(url)
                .get()
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                val body = response.body?.string()
                val type = object : TypeToken<List<com.drewcore.waiter_app.data.models.OrderType>>() {}.type
                val orderTypes = gson.fromJson<List<com.drewcore.waiter_app.data.models.OrderType>>(body, type)
                Result.success(orderTypes)
            } else {
                Result.failure(Exception("Error fetching order types: ${response.code}"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching order types", e)
            Result.failure(e)
        }
    }

    /**
     * Fetches available tables from POS server
     */
    suspend fun getTables(): Result<List<com.drewcore.waiter_app.data.models.Table>> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$serverIp:$PORT/api/tables"
            val request = Request.Builder()
                .url(url)
                .get()
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                val body = response.body?.string()
                val type = object : TypeToken<List<com.drewcore.waiter_app.data.models.Table>>() {}.type
                val tables = gson.fromJson<List<com.drewcore.waiter_app.data.models.Table>>(body, type)
                Result.success(tables)
            } else {
                Result.failure(Exception("Error fetching tables: ${response.code}"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching tables", e)
            Result.failure(e)
        }
    }

    /**
     * Fetches table areas/zones from POS server
     */
    suspend fun getTableAreas(): Result<List<TableArea>> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$serverIp:$PORT/api/table-areas"
            val request = Request.Builder()
                .url(url)
                .get()
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                val body = response.body?.string()
                val type = object : TypeToken<List<TableArea>>() {}.type
                val areas = gson.fromJson<List<TableArea>>(body, type)
                Result.success(areas)
            } else {
                // If areas endpoint doesn't exist, return empty list (backwards compatibility)
                Log.w(TAG, "Table areas not available: ${response.code}")
                Result.success(emptyList())
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching table areas", e)
            Result.success(emptyList()) // Return empty list on error for backwards compatibility
        }
    }

    /**
     * Fetches custom pages from POS server
     */
    suspend fun getCustomPages(): Result<List<com.drewcore.waiter_app.data.models.CustomPage>> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$serverIp:$PORT/api/custom-pages"
            val request = Request.Builder()
                .url(url)
                .get()
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                val body = response.body?.string()
                val type = object : TypeToken<List<com.drewcore.waiter_app.data.models.CustomPage>>() {}.type
                val pages = gson.fromJson<List<com.drewcore.waiter_app.data.models.CustomPage>>(body, type)
                Result.success(pages)
            } else {
                Result.failure(Exception("Error fetching custom pages: ${response.code}"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching custom pages", e)
            Result.failure(e)
        }
    }

    /**
     * Fetches products for a specific custom page
     */
    suspend fun getCustomPageProducts(pageId: Int): Result<List<Product>> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$serverIp:$PORT/api/custom-pages/$pageId/products"
            val request = Request.Builder()
                .url(url)
                .get()
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                val body = response.body?.string()
                val type = object : TypeToken<List<Product>>() {}.type
                val products = gson.fromJson<List<Product>>(body, type)
                Result.success(products)
            } else {
                Result.failure(Exception("Error fetching page products: ${response.code}"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching page products", e)
            Result.failure(e)
        }
    }

    /**
     * Updates table status
     */
    suspend fun updateTableStatus(tableId: Int, status: String): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$serverIp:$PORT/api/tables/status"
            val requestBody = gson.toJson(mapOf("table_id" to tableId, "status" to status))
            val mediaType = "application/json; charset=utf-8".toMediaType()

            val request = Request.Builder()
                .url(url)
                .patch(requestBody.toRequestBody(mediaType))
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                Result.failure(Exception("Error updating table status: ${response.code}"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error updating table status", e)
            Result.failure(e)
        }
    }

    /**
     * Fetches orders from POS server
     */
    suspend fun getOrders(status: String? = null, tableId: Int? = null): Result<List<com.drewcore.waiter_app.data.models.OrderResponse>> = withContext(Dispatchers.IO) {
        try {
            var url = "http://$serverIp:$PORT/api/orders?"
            if (status != null) {
                url += "status=$status&"
            }
            if (tableId != null) {
                url += "table_id=$tableId&"
            }

            val request = Request.Builder()
                .url(url)
                .get()
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                val body = response.body?.string()
                val type = object : TypeToken<List<com.drewcore.waiter_app.data.models.OrderResponse>>() {}.type
                val orders = gson.fromJson<List<com.drewcore.waiter_app.data.models.OrderResponse>>(body, type)
                Result.success(orders)
            } else {
                Result.failure(Exception("Error fetching orders: ${response.code}"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error fetching orders", e)
            Result.failure(e)
        }
    }

    /**
     * Deletes an order from POS server
     */
    suspend fun deleteOrder(orderId: Int): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$serverIp:$PORT/api/orders/$orderId"
            val request = Request.Builder()
                .url(url)
                .delete()
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                val error = response.body?.string() ?: "Unknown error"
                Result.failure(Exception("Error deleting order: $error"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error deleting order", e)
            Result.failure(e)
        }
    }

    /**
     * Updates an existing order
     */
    suspend fun updateOrder(orderId: Int, order: OrderRequest): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$serverIp:$PORT/api/orders/$orderId"
            val json = gson.toJson(order)
            val mediaType = "application/json; charset=utf-8".toMediaType()
            val requestBody = json.toRequestBody(mediaType)

            val request = Request.Builder()
                .url(url)
                .put(requestBody)
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                val error = response.body?.string() ?: "Unknown error"
                Result.failure(Exception("Error updating order: $error"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error updating order", e)
            Result.failure(e)
        }
    }

    /**
     * Sends an order to kitchen (resend)
     */
    suspend fun sendToKitchen(orderId: Int): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            val url = "http://$serverIp:$PORT/api/orders/$orderId/send-to-kitchen"
            val request = Request.Builder()
                .url(url)
                .post("".toRequestBody(null))
                .build()

            val response = client.newCall(request).execute()

            if (response.isSuccessful) {
                Result.success(Unit)
            } else {
                val error = response.body?.string() ?: "Unknown error"
                Result.failure(Exception("Error sending to kitchen: $error"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error sending to kitchen", e)
            Result.failure(e)
        }
    }
}
