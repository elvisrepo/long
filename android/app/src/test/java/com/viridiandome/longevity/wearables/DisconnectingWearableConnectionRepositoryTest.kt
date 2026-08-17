package com.viridiandome.longevity.wearables

import com.viridiandome.longevity.wearables.sync.WeightSyncCursorStore
import com.viridiandome.longevity.wearables.sync.WeightSyncScheduler
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class DisconnectingWearableConnectionRepositoryTest {
    @Test
    fun successful_disconnect_cancels_only_its_work_and_removes_its_cursor() =
        runTest {
            val delegate = DisconnectOnlyRepository(
                WearableConnectionDisconnectResult.Success,
            )
            val scheduler = RecordingWeightSyncScheduler()
            val cursorStore = RecordingWeightSyncCursorStore()
            val repository = DisconnectingWearableConnectionRepository(
                delegate = delegate,
                scheduler = scheduler,
                cursorStore = cursorStore,
            )

            val result = repository.disconnect(CONNECTION_ID)

            assertSame(WearableConnectionDisconnectResult.Success, result)
            assertEquals(listOf(CONNECTION_ID), scheduler.cancelledConnectionIds)
            assertEquals(listOf(CONNECTION_ID), cursorStore.removedConnectionIds)
        }

    @Test
    fun failed_disconnect_preserves_local_work_and_cursor() = runTest {
        val scheduler = RecordingWeightSyncScheduler()
        val cursorStore = RecordingWeightSyncCursorStore()
        val repository = DisconnectingWearableConnectionRepository(
            delegate = DisconnectOnlyRepository(
                WearableConnectionDisconnectResult.Unavailable,
            ),
            scheduler = scheduler,
            cursorStore = cursorStore,
        )

        val result = repository.disconnect(CONNECTION_ID)

        assertSame(WearableConnectionDisconnectResult.Unavailable, result)
        assertEquals(emptyList<String>(), scheduler.cancelledConnectionIds)
        assertEquals(emptyList<String>(), cursorStore.removedConnectionIds)
    }

    @Test
    fun confirmed_disconnect_is_not_reversed_by_cursor_cleanup_failure() =
        runTest {
            val scheduler = RecordingWeightSyncScheduler()
            val repository = DisconnectingWearableConnectionRepository(
                delegate = DisconnectOnlyRepository(
                    WearableConnectionDisconnectResult.Success,
                ),
                scheduler = scheduler,
                cursorStore = FailingRemovalCursorStore,
            )

            val result = repository.disconnect(CONNECTION_ID)

            assertSame(WearableConnectionDisconnectResult.Success, result)
            assertEquals(listOf(CONNECTION_ID), scheduler.cancelledConnectionIds)
        }

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
    }
}

private class DisconnectOnlyRepository(
    private val result: WearableConnectionDisconnectResult,
) : WearableConnectionRepository {
    override suspend fun disconnect(
        connectionId: String,
    ): WearableConnectionDisconnectResult = result

    override suspend fun getConnections(): WearableConnectionsResult =
        error("Connection reads are not under test.")

    override suspend fun registerHealthConnect():
        WearableConnectionRegistrationResult =
        error("Registration is not under test.")

    override suspend fun getOrRegisterHealthConnect():
        WearableConnectionResolutionResult =
        error("Resolution is not under test.")
}

private class RecordingWeightSyncScheduler : WeightSyncScheduler {
    val cancelledConnectionIds = mutableListOf<String>()

    override fun schedule(
        connectionId: String,
        repeatIntervalMinutes: Long,
    ) = error("Scheduling is not under test.")

    override fun cancel(connectionId: String) {
        cancelledConnectionIds += connectionId
    }

    override fun cancelAll() = error("Global cancellation is not under test.")
}

private class RecordingWeightSyncCursorStore : WeightSyncCursorStore {
    val removedConnectionIds = mutableListOf<String>()

    override suspend fun read(connectionId: String): Instant? =
        error("Cursor reads are not under test.")

    override suspend fun write(
        connectionId: String,
        cursor: Instant,
    ) = error("Cursor writes are not under test.")

    override suspend fun remove(connectionId: String) {
        removedConnectionIds += connectionId
    }
}

private object FailingRemovalCursorStore : WeightSyncCursorStore {
    override suspend fun read(connectionId: String): Instant? = null

    override suspend fun write(connectionId: String, cursor: Instant) = Unit

    override suspend fun remove(connectionId: String) {
        throw IOException("Test cursor removal failure.")
    }
}
