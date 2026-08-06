package com.viridiandome.longevity.wearables.sync

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException
import java.time.Instant

/** Persists per-connection sync watermarks in private application storage. */
class SharedPreferencesWeightSyncCursorStore(
    context: Context,
    preferencesName: String = DEFAULT_PREFERENCES_NAME,
) : WeightSyncCursorStore {
    private val preferences: SharedPreferences = context.applicationContext
        .getSharedPreferences(preferencesName, Context.MODE_PRIVATE)

    override suspend fun read(connectionId: String): Instant? =
        withContext(Dispatchers.IO) {
            val key = cursorKey(connectionId)
            if (!preferences.contains(key)) {
                return@withContext null
            }

            try {
                Instant.ofEpochMilli(preferences.getLong(key, 0L))
            } catch (_: ClassCastException) {
                removeCorruptedCursor(key)
                null
            }
        }

    override suspend fun write(
        connectionId: String,
        cursor: Instant,
    ) = withContext(Dispatchers.IO) {
        val committed = preferences.edit()
            .putLong(cursorKey(connectionId), cursor.toEpochMilli())
            .commit()
        if (!committed) {
            throw IOException("Unable to persist the weight sync cursor.")
        }
    }

    private fun cursorKey(connectionId: String): String {
        require(connectionId.isNotBlank()) { "Connection ID must not be blank." }
        return "$CURSOR_KEY_PREFIX$connectionId"
    }

    private fun removeCorruptedCursor(key: String) {
        if (!preferences.edit().remove(key).commit()) {
            throw IOException("Unable to remove a corrupted weight sync cursor.")
        }
    }

    private companion object {
        const val DEFAULT_PREFERENCES_NAME = "longevity_weight_sync_cursors"
        const val CURSOR_KEY_PREFIX = "connection_cursor_"
    }
}
