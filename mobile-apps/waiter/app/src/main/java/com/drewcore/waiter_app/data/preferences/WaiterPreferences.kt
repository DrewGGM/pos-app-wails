package com.drewcore.waiter_app.data.preferences

import android.content.Context
import android.content.SharedPreferences
import com.drewcore.waiter_app.data.models.Product
import com.drewcore.waiter_app.data.models.Table
import com.drewcore.waiter_app.data.models.TableGridLayout
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
        private const val KEY_TABLE_GRID_LAYOUT = "table_grid_layout"
        private const val KEY_TABLE_GRID_LAYOUTS_BY_AREA = "table_grid_layouts_by_area"
        private const val KEY_CACHED_PRODUCTS = "cached_products"
        private const val KEY_CACHED_TABLES = "cached_tables"
        private const val KEY_PRODUCTS_CACHE_TIMESTAMP = "products_cache_timestamp"
        private const val KEY_TABLES_CACHE_TIMESTAMP = "tables_cache_timestamp"

        // Tunnel configuration keys
        private const val KEY_TUNNEL_ENABLED = "tunnel_enabled"
        private const val KEY_TUNNEL_URL = "tunnel_url"
        private const val KEY_TUNNEL_USE_SECURE = "tunnel_use_secure"

        // Background connection key
        private const val KEY_BACKGROUND_CONNECTION_ENABLED = "background_connection_enabled"
        private const val KEY_LAST_SERVER_ADDRESS = "last_server_address"
        private const val KEY_LAST_SERVER_IS_TUNNEL = "last_server_is_tunnel"
        private const val KEY_LAST_SERVER_IS_SECURE = "last_server_is_secure"

        // Cache validity: 30 minutes (we have real-time updates via WebSocket)
        private const val CACHE_VALIDITY_MS = 30 * 60 * 1000L

        // Default values
        const val DEFAULT_GRID_COLUMNS = 2
        const val DEFAULT_TABLE_GRID_COLUMNS = 4
        const val DEFAULT_TABLE_GRID_ROWS = 4
    }

    var gridColumns: Int
        get() = prefs.getInt(KEY_GRID_COLUMNS, DEFAULT_GRID_COLUMNS)
        set(value) { prefs.edit().putInt(KEY_GRID_COLUMNS, value).apply() }

    var tableGridColumns: Int
        get() = prefs.getInt(KEY_TABLE_GRID_COLUMNS, DEFAULT_TABLE_GRID_COLUMNS)
        set(value) { prefs.edit().putInt(KEY_TABLE_GRID_COLUMNS, value).apply() }

    // Legacy table order - kept for backward compatibility
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

    // Table Grid Layout - visual restaurant layout
    fun getTableGridLayout(): TableGridLayout? {
        val json = prefs.getString(KEY_TABLE_GRID_LAYOUT, null) ?: return null
        return try {
            gson.fromJson(json, TableGridLayout::class.java)
        } catch (e: Exception) {
            android.util.Log.e("WaiterPreferences", "Failed to parse table grid layout", e)
            null
        }
    }

    fun setTableGridLayout(layout: TableGridLayout) {
        val json = gson.toJson(layout)
        prefs.edit().putString(KEY_TABLE_GRID_LAYOUT, json).apply()
    }

    fun clearTableGridLayout() {
        prefs.edit().remove(KEY_TABLE_GRID_LAYOUT).apply()
    }

    // Per-area grid layouts - each area can have its own layout
    fun getTableGridLayoutForArea(areaId: Int): TableGridLayout? {
        val allLayouts = getAllAreaGridLayouts()
        return allLayouts[areaId]
    }

    fun setTableGridLayoutForArea(areaId: Int, layout: TableGridLayout) {
        val allLayouts = getAllAreaGridLayouts().toMutableMap()
        allLayouts[areaId] = layout
        saveAllAreaGridLayouts(allLayouts)
    }

    fun clearTableGridLayoutForArea(areaId: Int) {
        val allLayouts = getAllAreaGridLayouts().toMutableMap()
        allLayouts.remove(areaId)
        saveAllAreaGridLayouts(allLayouts)
    }

    fun getAllAreaGridLayouts(): Map<Int, TableGridLayout> {
        val json = prefs.getString(KEY_TABLE_GRID_LAYOUTS_BY_AREA, null) ?: return emptyMap()
        return try {
            val type = object : TypeToken<Map<Int, TableGridLayout>>() {}.type
            gson.fromJson(json, type) ?: emptyMap()
        } catch (e: Exception) {
            android.util.Log.e("WaiterPreferences", "Failed to parse area grid layouts", e)
            emptyMap()
        }
    }

    private fun saveAllAreaGridLayouts(layouts: Map<Int, TableGridLayout>) {
        val json = gson.toJson(layouts)
        prefs.edit().putString(KEY_TABLE_GRID_LAYOUTS_BY_AREA, json).apply()
    }

    // Create default grid layout from tables
    fun createDefaultGridLayout(tables: List<Table>): TableGridLayout {
        val cols = DEFAULT_TABLE_GRID_COLUMNS
        val rows = ((tables.size + cols - 1) / cols).coerceAtLeast(DEFAULT_TABLE_GRID_ROWS)
        val positions = mutableMapOf<String, Int>()

        tables.forEachIndexed { index, table ->
            val row = index / cols
            val col = index % cols
            positions[TableGridLayout.positionKey(row, col)] = table.id
        }

        return TableGridLayout(rows = rows, columns = cols, positions = positions)
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

    // Tunnel configuration
    var tunnelEnabled: Boolean
        get() = prefs.getBoolean(KEY_TUNNEL_ENABLED, false)
        set(value) { prefs.edit().putBoolean(KEY_TUNNEL_ENABLED, value).apply() }

    var tunnelUrl: String?
        get() = prefs.getString(KEY_TUNNEL_URL, null)
        set(value) { prefs.edit().putString(KEY_TUNNEL_URL, value).apply() }

    var tunnelUseSecure: Boolean
        get() = prefs.getBoolean(KEY_TUNNEL_USE_SECURE, true)
        set(value) { prefs.edit().putBoolean(KEY_TUNNEL_USE_SECURE, value).apply() }

    fun clearTunnelConfig() {
        prefs.edit()
            .remove(KEY_TUNNEL_ENABLED)
            .remove(KEY_TUNNEL_URL)
            .remove(KEY_TUNNEL_USE_SECURE)
            .apply()
    }

    fun resetToDefaults() {
        prefs.edit().clear().apply()
    }

    // Background connection settings
    var backgroundConnectionEnabled: Boolean
        get() = prefs.getBoolean(KEY_BACKGROUND_CONNECTION_ENABLED, true) // Enabled by default
        set(value) { prefs.edit().putBoolean(KEY_BACKGROUND_CONNECTION_ENABLED, value).apply() }

    // Last successful server connection info (for auto-reconnect)
    var lastServerAddress: String?
        get() = prefs.getString(KEY_LAST_SERVER_ADDRESS, null)
        set(value) { prefs.edit().putString(KEY_LAST_SERVER_ADDRESS, value).apply() }

    var lastServerIsTunnel: Boolean
        get() = prefs.getBoolean(KEY_LAST_SERVER_IS_TUNNEL, false)
        set(value) { prefs.edit().putBoolean(KEY_LAST_SERVER_IS_TUNNEL, value).apply() }

    var lastServerIsSecure: Boolean
        get() = prefs.getBoolean(KEY_LAST_SERVER_IS_SECURE, false)
        set(value) { prefs.edit().putBoolean(KEY_LAST_SERVER_IS_SECURE, value).apply() }

    fun saveLastConnection(address: String, isTunnel: Boolean, isSecure: Boolean) {
        prefs.edit()
            .putString(KEY_LAST_SERVER_ADDRESS, address)
            .putBoolean(KEY_LAST_SERVER_IS_TUNNEL, isTunnel)
            .putBoolean(KEY_LAST_SERVER_IS_SECURE, isSecure)
            .apply()
    }

    fun clearLastConnection() {
        prefs.edit()
            .remove(KEY_LAST_SERVER_ADDRESS)
            .remove(KEY_LAST_SERVER_IS_TUNNEL)
            .remove(KEY_LAST_SERVER_IS_SECURE)
            .apply()
    }
}
