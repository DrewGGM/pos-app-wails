package com.drewcore.waiter_app.ui.util

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import android.util.Log
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Singleton image cache to prevent memory leaks and repeated Base64 decoding.
 * Uses LruCache with a configurable max size based on available memory.
 */
object ImageCache {
    private const val TAG = "ImageCache"

    // Use 1/8 of available memory for cache (reasonable for image-heavy apps)
    private val maxMemory = (Runtime.getRuntime().maxMemory() / 1024).toInt()
    private val cacheSize = maxMemory / 8

    private val memoryCache = object : LruCache<String, ImageBitmap>(cacheSize) {
        override fun sizeOf(key: String, bitmap: ImageBitmap): Int {
            // Size in kilobytes (approximate)
            return (bitmap.width * bitmap.height * 4) / 1024
        }
    }

    /**
     * Get image from cache or decode from Base64 string.
     * Returns null if decoding fails.
     */
    suspend fun getOrDecode(imageUrl: String): ImageBitmap? {
        // Generate cache key from the image URL hash
        val cacheKey = imageUrl.hashCode().toString()

        // Try to get from cache first
        memoryCache.get(cacheKey)?.let { cached ->
            return cached
        }

        // Not in cache, decode in IO thread
        return withContext(Dispatchers.IO) {
            try {
                // Remove data URI prefix if present
                val base64String = if (imageUrl.contains("base64,")) {
                    imageUrl.substringAfter("base64,")
                } else {
                    imageUrl
                }

                // Decode Base64 to byte array
                val decodedBytes = Base64.decode(base64String, Base64.DEFAULT)

                // Decode with sample size for memory efficiency
                val options = BitmapFactory.Options().apply {
                    // First, just get the dimensions
                    inJustDecodeBounds = true
                }
                BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size, options)

                // Calculate sample size (target max 300x300 for product thumbnails)
                options.inSampleSize = calculateInSampleSize(options, 300, 300)
                options.inJustDecodeBounds = false

                // Now decode with the sample size
                val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size, options)

                bitmap?.asImageBitmap()?.also { imageBitmap ->
                    // Store in cache
                    memoryCache.put(cacheKey, imageBitmap)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to decode Base64 image", e)
                null
            }
        }
    }

    /**
     * Calculate optimal sample size for memory-efficient loading.
     */
    private fun calculateInSampleSize(options: BitmapFactory.Options, reqWidth: Int, reqHeight: Int): Int {
        val height = options.outHeight
        val width = options.outWidth
        var inSampleSize = 1

        if (height > reqHeight || width > reqWidth) {
            val halfHeight = height / 2
            val halfWidth = width / 2

            while ((halfHeight / inSampleSize) >= reqHeight && (halfWidth / inSampleSize) >= reqWidth) {
                inSampleSize *= 2
            }
        }

        return inSampleSize
    }

    /**
     * Clear the cache (useful for memory pressure situations).
     */
    fun clearCache() {
        memoryCache.evictAll()
    }

    /**
     * Get current cache stats for debugging.
     */
    fun getCacheStats(): String {
        return "Cache: ${memoryCache.size()}KB / ${cacheSize}KB (${memoryCache.hitCount()} hits, ${memoryCache.missCount()} misses)"
    }
}
