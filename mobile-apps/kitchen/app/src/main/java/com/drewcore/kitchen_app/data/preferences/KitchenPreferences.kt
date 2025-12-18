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
