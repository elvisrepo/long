package com.viridiandome.longevity.wearables.sync

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import java.time.Instant

class SharedPreferencesWeightSyncCursorStoreTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Before
    fun setUp() {
        context.deleteSharedPreferences(TEST_PREFERENCES_NAME)
    }

    @After
    fun tearDown() {
        context.deleteSharedPreferences(TEST_PREFERENCES_NAME)
    }

    @Test
    fun cursor_survives_creating_a_new_store_instance() = runTest {
        val cursor = Instant.parse("2026-08-06T12:00:00Z")
        val firstStore = SharedPreferencesWeightSyncCursorStore(
            context = context,
            preferencesName = TEST_PREFERENCES_NAME,
        )

        firstStore.write(CONNECTION_ID, cursor)

        val reopenedStore = SharedPreferencesWeightSyncCursorStore(
            context = context,
            preferencesName = TEST_PREFERENCES_NAME,
        )
        assertEquals(cursor, reopenedStore.read(CONNECTION_ID))
    }

    @Test
    fun cursors_are_isolated_by_connection_id() = runTest {
        val firstCursor = Instant.parse("2026-08-06T12:00:00Z")
        val secondCursor = Instant.parse("2026-08-06T13:00:00Z")
        val store = SharedPreferencesWeightSyncCursorStore(
            context = context,
            preferencesName = TEST_PREFERENCES_NAME,
        )

        store.write(CONNECTION_ID, firstCursor)
        store.write(SECOND_CONNECTION_ID, secondCursor)

        assertEquals(firstCursor, store.read(CONNECTION_ID))
        assertEquals(secondCursor, store.read(SECOND_CONNECTION_ID))
    }

    @Test
    fun missing_connection_cursor_returns_null() = runTest {
        val store = SharedPreferencesWeightSyncCursorStore(
            context = context,
            preferencesName = TEST_PREFERENCES_NAME,
        )

        assertNull(store.read(CONNECTION_ID))
    }

    @Test
    fun corrupted_connection_cursor_is_removed_and_returns_null() = runTest {
        val store = SharedPreferencesWeightSyncCursorStore(
            context = context,
            preferencesName = TEST_PREFERENCES_NAME,
        )
        store.write(CONNECTION_ID, Instant.parse("2026-08-06T12:00:00Z"))
        val preferences = context.getSharedPreferences(
            TEST_PREFERENCES_NAME,
            Context.MODE_PRIVATE,
        )
        val cursorKey = preferences.all.keys.single()
        preferences.edit().putString(cursorKey, "not-a-timestamp").commit()

        assertNull(store.read(CONNECTION_ID))
        assertFalse(preferences.contains(cursorKey))
    }

    private companion object {
        const val TEST_PREFERENCES_NAME = "longevity_weight_sync_cursors_test"
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
        const val SECOND_CONNECTION_ID = "c5617488-345d-4f97-8e38-8f99bb2d8e20"
    }
}
