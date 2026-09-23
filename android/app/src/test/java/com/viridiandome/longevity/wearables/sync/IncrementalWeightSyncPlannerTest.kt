package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectWeightReader
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class IncrementalWeightSyncPlannerTest {
    @Test
    fun stored_connection_cursor_is_read_with_a_twenty_four_hour_overlap() = runTest {
        val cursor = Instant.parse("2026-08-05T12:00:00Z")
        val now = Instant.parse("2026-08-06T12:00:00Z")
        val reader = RecordingIncrementalWeightReader()
        val cursorStore = RecordingWeightSyncCursorStore(
            cursors = mapOf(CONNECTION_ID to cursor),
        )
        val planner = IncrementalWeightSyncPlanner(
            reader = reader,
            cursorStore = cursorStore,
            clock = Clock.fixed(now, ZoneOffset.UTC),
        )

        planner.readBatches(CONNECTION_ID)

        assertEquals(listOf(CONNECTION_ID), cursorStore.reads)
        assertEquals(Instant.parse("2026-08-04T12:00:00Z"), reader.startTime)
        assertEquals(now, reader.endTime)
    }

    @Test
    fun missing_cursor_falls_back_to_exactly_thirty_days() = runTest {
        val now = Instant.parse("2026-08-06T12:00:00Z")
        val reader = RecordingIncrementalWeightReader()
        val planner = IncrementalWeightSyncPlanner(
            reader = reader,
            cursorStore = RecordingWeightSyncCursorStore(emptyMap()),
            clock = Clock.fixed(now, ZoneOffset.UTC),
        )

        planner.readBatches(CONNECTION_ID)

        assertEquals(Instant.parse("2026-07-07T12:00:00Z"), reader.startTime)
        assertEquals(now, reader.endTime)
    }

    @Test
    fun only_samsung_samples_are_batched_without_reordering() = runTest {
        val samsungSamples = (1..101).map { index ->
            weightSample("samsung-$index", "com.sec.android.app.shealth")
        }
        val otherSample = weightSample("other-1", "com.example.otherhealthapp")
        val planner = IncrementalWeightSyncPlanner(
            reader = RecordingIncrementalWeightReader(
                samples = samsungSamples + otherSample,
            ),
            cursorStore = RecordingWeightSyncCursorStore(emptyMap()),
            clock = Clock.fixed(
                Instant.parse("2026-08-06T12:00:00Z"),
                ZoneOffset.UTC,
            ),
        )

        val batches = planner.readBatches(CONNECTION_ID)

        assertEquals(listOf(100, 1), batches.map { it.size })
        assertEquals("samsung-1", batches.first().first().recordId)
        assertEquals("samsung-101", batches.last().single().recordId)
    }

    private fun weightSample(
        id: String,
        sourcePackageName: String,
    ): HealthConnectWeightSample = HealthConnectWeightSample(
        recordId = id,
        kilograms = 78.4,
        recordedAt = Instant.parse("2026-08-06T08:00:00Z"),
        sourcePackageName = sourcePackageName,
        sourceRecordModifiedAt = Instant.parse("2026-08-06T08:01:00Z"),
    )

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
    }
}

private class RecordingIncrementalWeightReader(
    private val samples: List<HealthConnectWeightSample> = emptyList(),
) : HealthConnectWeightReader {
    var startTime: Instant? = null
        private set
    var endTime: Instant? = null
        private set

    override suspend fun readWeightSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectWeightSample> {
        this.startTime = startTime
        this.endTime = endTime
        return samples
    }
}

private class RecordingWeightSyncCursorStore(
    private val cursors: Map<String, Instant>,
) : WeightSyncCursorStore {
    val reads = mutableListOf<String>()

    override suspend fun read(connectionId: String): Instant? {
        reads += connectionId
        return cursors[connectionId]
    }

    override suspend fun write(
        connectionId: String,
        cursor: Instant,
    ) = Unit

    override suspend fun remove(connectionId: String) = Unit
}
