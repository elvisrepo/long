package com.viridiandome.longevity.wearables.sync

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class IncrementalWeightSyncRunnerTest {
    @Test
    fun completed_sync_advances_the_connection_cursor_to_run_start() = runTest {
        val runStartedAt = Instant.parse("2026-08-06T12:00:00Z")
        val result = WeightSyncResult.Completed(emptyList())
        val delegate = FixedWeightSyncRunner(result)
        val cursorStore = RunnerRecordingCursorStore()
        val runner = IncrementalWeightSyncRunner(
            delegate = delegate,
            cursorStore = cursorStore,
            clock = Clock.fixed(runStartedAt, ZoneOffset.UTC),
        )

        val actual = runner.sync(CONNECTION_ID)

        assertEquals(result, actual)
        assertEquals(listOf(CONNECTION_ID), delegate.connectionIds)
        assertEquals(
            listOf(CursorWrite(CONNECTION_ID, runStartedAt)),
            cursorStore.writes,
        )
    }

    @Test
    fun no_data_sync_still_advances_the_connection_cursor() = runTest {
        val runStartedAt = Instant.parse("2026-08-06T12:00:00Z")
        val cursorStore = RunnerRecordingCursorStore()
        val runner = IncrementalWeightSyncRunner(
            delegate = FixedWeightSyncRunner(WeightSyncResult.NoData),
            cursorStore = cursorStore,
            clock = Clock.fixed(runStartedAt, ZoneOffset.UTC),
        )

        val result = runner.sync(CONNECTION_ID)

        assertEquals(WeightSyncResult.NoData, result)
        assertEquals(
            listOf(CursorWrite(CONNECTION_ID, runStartedAt)),
            cursorStore.writes,
        )
    }

    @Test
    fun interrupted_sync_does_not_advance_the_connection_cursor() = runTest {
        val interrupted = WeightSyncResult.Interrupted(
            completedReceipts = emptyList(),
            failure = WeightSyncFailure.Unavailable,
        )
        val cursorStore = RunnerRecordingCursorStore()
        val runner = IncrementalWeightSyncRunner(
            delegate = FixedWeightSyncRunner(interrupted),
            cursorStore = cursorStore,
            clock = Clock.fixed(
                Instant.parse("2026-08-06T12:00:00Z"),
                ZoneOffset.UTC,
            ),
        )

        val result = runner.sync(CONNECTION_ID)

        assertEquals(interrupted, result)
        assertEquals(emptyList<CursorWrite>(), cursorStore.writes)
    }

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
    }
}

private class FixedWeightSyncRunner(
    private val result: WeightSyncResult,
) : WeightSyncRunner {
    val connectionIds = mutableListOf<String>()

    override suspend fun sync(connectionId: String): WeightSyncResult {
        connectionIds += connectionId
        return result
    }
}

private class RunnerRecordingCursorStore : WeightSyncCursorStore {
    val writes = mutableListOf<CursorWrite>()

    override suspend fun read(connectionId: String): Instant? = null

    override suspend fun write(
        connectionId: String,
        cursor: Instant,
    ) {
        writes += CursorWrite(connectionId, cursor)
    }
}

private data class CursorWrite(
    val connectionId: String,
    val cursor: Instant,
)
