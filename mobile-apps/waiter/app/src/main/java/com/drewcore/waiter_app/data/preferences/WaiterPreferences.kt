package com.drewcore.waiter_app.data.preferences

import android.content.Context
import android.content.SharedPreferences
import com.drewcore.waiter_app.data.models.Product
import com.drewcore.waiter_app.data.models.Table
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken

class WaiterPreferences(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        "waiter_preferences",
        Context.MODE_PRIVATE
    )
    private val gson = Gson()

    companion object {
        private const val KEY_GRID_COLUMNS = "grid_columns"
        private const val KEY_TABLE_GRID_COLUMNS = "table_grid_columns"
        private const val KEY_TABLE_ORDER = "table_order"
        private const val KEY_CACHED_PRODUCTS = "cached_products"
        private const val KEY_CACHED_TABLES = "cached_tables"
        private const val KEY_PRODUCTS_CACHE_TIMESTAMP = "products_cache_timestamp"
        private const val KEY_TABLES_CACHE_TIMESTAMP = "tables_cache_timestamp"

        // Cache validity: 5 minutes (products change less frequently)
        private const val CACHE_VALIDITY_MS = 5 * 60 * 1000L

        // Default values
        const val DEFAULT_GRID_COLUMNS = 2
        const val DEFAULT_TABLE_GRID_COLUMNS = 3
    }

    var gridColumns: Int
        get() = prefs.getInt(KEY_GRID_COLUMNS, DEFAULT_GRID_COLUMNS)
        set(value) { prefs.edit().putInt(KEY_GRID_COLUMNS, value).apply() }

    var tableGridColumns: Int
        get() = prefs.getInt(KEY_TABLE_GRID_COLUMNS, DEFAULT_TABLE_GRID_COLUMNS)
        set(value) { prefs.edit().putInt(KEY_TABLE_GRID_COLUMNS, value).apply() }

    // Custom table order - stores list of table IDs in custom order
    fun getTableOrder(): List<Int>? {
        val json = prefs.getString(KEY_TABLE_ORDER, null) ?: return null
        return try {
            val type = object : TypeToken<List<Int>>() {}.type
            gson.fromJson(json, type)
        } catch (e: Exception) {
            null
        }
    }

    fun setTableOrder(tableIds: List<Int>) {
        val json = gson.toJson(tableIds)
        prefs.edit().putString(KEY_TABLE_ORDER, json).apply()
    }

    fun clearTableOrder() {
        prefs.edit().remove(KEY_TABLE_ORDER).apply()
    }

    // Products cache
    fun getCachedProducts(): List<Product>? {
        val timestamp = prefs.getLong(KEY_PRODUCTS_CACHE_TIMESTAMP, 0L)
        if (System.currentTimeMillis() - timestamp > CACHE_VALIDITY_MS) {
            // Cache expired
            return null
        }

        val json = prefs.getString(KEY_CACHED_PRODUCTS, null) ?: return null
        return try {
            val type = object : TypeToken<List<Product>>() {}.type
            gson.fromJson(json, type)
        } catch (e: Exception) {
            android.util.Log.e("WaiterPreferences", "Failed to parse cached products", e)
            null
        }
    }

    fun cacheProducts(products: List<Product>) {
        val json = gson.toJson(products)
        prefs.edit()
            .putString(KEY_CACHED_PRODUCTS, json)
            .putLong(KEY_PRODUCTS_CACHE_TIMESTAMP, System.currentTimeMillis())
            .apply()
    }

    // Tables cache
    fun getCachedTables(): List<Table>? {
        val timestamp = prefs.getLong(KEY_TABLES_CACHE_TIMESTAMP, 0L)
        if (System.currentTimeMillis() - timestamp > CACHE_VALIDITY_MS) {
            // Cache expired
            return null
        }

        val json = prefs.getString(KEY_CACHED_TABLES, null) ?: return null
        return try {
            val type = object : TypeToken<List<Table>>() {}.type
            gson.fromJson(json, type)
        } catch (e: Exception) {
            android.util.Log.e("WaiterPreferences", "Failed to parse cached tables", e)
            null
        }
    }

    fun cacheTables(tables: List<Table>) {
        val json = gson.toJson(tables)
        prefs.edit()
            .putString(KEY_CACHED_TABLES, json)
            .putLong(KEY_TABLES_CACHE_TIMESTAMP, System.currentTimeMillis())
            .apply()
    }

    fun clearCache() {
        prefs.edit()
            .remove(KEY_CACHED_PRODUCTS)
            .remove(KEY_CACHED_TABLES)
            .remove(KEY_PRODUCTS_CACHE_TIMESTAMP)
            .remove(KEY_TABLES_CACHE_TIMESTAMP)
            .apply()
    }

    fun resetToDefaults() {
        prefs.edit().clear().apply()
    }
}
