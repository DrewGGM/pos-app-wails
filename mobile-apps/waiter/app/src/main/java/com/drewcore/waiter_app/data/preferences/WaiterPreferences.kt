package com.drewcore.waiter_app.data.preferences

import android.content.Context
import android.content.SharedPreferences

class WaiterPreferences(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        "waiter_preferences",
        Context.MODE_PRIVATE
    )

    companion object {
        private const val KEY_GRID_COLUMNS = "grid_columns"

        // Default values
        const val DEFAULT_GRID_COLUMNS = 2
    }

    var gridColumns: Int
        get() = prefs.getInt(KEY_GRID_COLUMNS, DEFAULT_GRID_COLUMNS)
        set(value) = prefs.edit().putInt(KEY_GRID_COLUMNS, value).apply()

    fun resetToDefaults() {
        prefs.edit().clear().apply()
    }
}
