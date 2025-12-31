package com.drewcore.kitchen_app.data.preferences

import android.content.Context
import android.content.SharedPreferences

class KitchenPreferences(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        "kitchen_preferences",
        Context.MODE_PRIVATE
    )

    companion object {
        private const val KEY_GRID_COLUMNS = "grid_columns"
        private const val KEY_CARD_HEIGHT = "card_height"
        private const val KEY_HEADER_FONT_SIZE = "header_font_size"
        private const val KEY_ITEM_FONT_SIZE = "item_font_size"
        private const val KEY_MAX_ITEMS_PER_CARD = "max_items_per_card"

        // Tunnel configuration keys
        private const val KEY_TUNNEL_ENABLED = "tunnel_enabled"
        private const val KEY_TUNNEL_URL = "tunnel_url"
        private const val KEY_TUNNEL_USE_SECURE = "tunnel_use_secure"

        // Sound configuration keys
        private const val KEY_NOTIFICATION_SOUND_URI = "notification_sound_uri"
        private const val KEY_SOUND_ENABLED = "sound_enabled"

        // Order type color configuration (stored as JSON map: orderTypeCode -> colorHex)
        private const val KEY_ORDER_TYPE_COLORS = "order_type_colors"

        // Default values
        const val DEFAULT_GRID_COLUMNS = 2
        const val DEFAULT_CARD_HEIGHT = 280
        const val DEFAULT_HEADER_FONT_SIZE = 22
        const val DEFAULT_ITEM_FONT_SIZE = 13
        const val DEFAULT_MAX_ITEMS_PER_CARD = 6
    }

    var gridColumns: Int
        get() = prefs.getInt(KEY_GRID_COLUMNS, DEFAULT_GRID_COLUMNS)
        set(value) { prefs.edit().putInt(KEY_GRID_COLUMNS, value).apply() }

    var cardHeight: Int
        get() = prefs.getInt(KEY_CARD_HEIGHT, DEFAULT_CARD_HEIGHT)
        set(value) { prefs.edit().putInt(KEY_CARD_HEIGHT, value).apply() }

    var headerFontSize: Int
        get() = prefs.getInt(KEY_HEADER_FONT_SIZE, DEFAULT_HEADER_FONT_SIZE)
        set(value) { prefs.edit().putInt(KEY_HEADER_FONT_SIZE, value).apply() }

    var itemFontSize: Int
        get() = prefs.getInt(KEY_ITEM_FONT_SIZE, DEFAULT_ITEM_FONT_SIZE)
        set(value) { prefs.edit().putInt(KEY_ITEM_FONT_SIZE, value).apply() }

    var maxItemsPerCard: Int
        get() = prefs.getInt(KEY_MAX_ITEMS_PER_CARD, DEFAULT_MAX_ITEMS_PER_CARD)
        set(value) { prefs.edit().putInt(KEY_MAX_ITEMS_PER_CARD, value).apply() }

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

    // Sound configuration
    var notificationSoundUri: String?
        get() = prefs.getString(KEY_NOTIFICATION_SOUND_URI, null)
        set(value) { prefs.edit().putString(KEY_NOTIFICATION_SOUND_URI, value).apply() }

    var soundEnabled: Boolean
        get() = prefs.getBoolean(KEY_SOUND_ENABLED, true)
        set(value) { prefs.edit().putBoolean(KEY_SOUND_ENABLED, value).apply() }

    // Order type colors (stored as JSON map)
    var orderTypeColorsJson: String?
        get() = prefs.getString(KEY_ORDER_TYPE_COLORS, null)
        set(value) { prefs.edit().putString(KEY_ORDER_TYPE_COLORS, value).apply() }

    /**
     * Get color for a specific order type code
     * Returns null if no custom color is set
     */
    fun getColorForOrderType(orderTypeCode: String?): String? {
        if (orderTypeCode == null) return null
        val json = orderTypeColorsJson ?: return null
        return try {
            // Parse JSON manually (simple key-value format)
            val regex = """"$orderTypeCode"\s*:\s*"([^"]+)"""".toRegex()
            regex.find(json)?.groupValues?.get(1)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Set color for a specific order type code
     */
    fun setColorForOrderType(orderTypeCode: String, colorHex: String) {
        val currentJson = orderTypeColorsJson
        val colorMap = mutableMapOf<String, String>()

        // Parse existing colors
        if (currentJson != null) {
            try {
                val entries = currentJson.removeSurrounding("{", "}").split(",")
                entries.forEach { entry ->
                    val parts = entry.split(":")
                    if (parts.size == 2) {
                        val key = parts[0].trim().removeSurrounding("\"")
                        val value = parts[1].trim().removeSurrounding("\"")
                        colorMap[key] = value
                    }
                }
            } catch (e: Exception) {
                // Ignore parsing errors
            }
        }

        // Update/add new color
        colorMap[orderTypeCode] = colorHex

        // Convert back to JSON
        val newJson = colorMap.entries.joinToString(",", "{", "}") { (k, v) ->
            """"$k":"$v""""
        }
        orderTypeColorsJson = newJson
    }

    fun resetToDefaults() {
        prefs.edit().clear().apply()
    }

    fun clearTunnelConfig() {
        prefs.edit()
            .remove(KEY_TUNNEL_ENABLED)
            .remove(KEY_TUNNEL_URL)
            .remove(KEY_TUNNEL_USE_SECURE)
            .apply()
    }
}
