package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectSleepReader
import com.viridiandome.longevity.wearables.HealthConnectSleepSample
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class IncrementalSleepSyncPlannerTest {
    @Test
    fun cursor_window_keeps_only_samsung_sleep_and_preserves_sessions() = runTest {
        val now = Instant.parse("2026-09-19T12:00:00Z")
        val cursor = Instant.parse("2026-09-19T10:00:00Z")
        val samsung = sleepSample("samsung", SAMSUNG_HEALTH_PACKAGE)
        val other = sleepSample("other", "com.example.health")
        val reader = RecordingSleepReader(listOf(samsung, other))
        val planner = IncrementalSleepSyncPlanner(
            reader = reader,
            cursorStore = FixedSleepCursorStore(cursor),
            clock = Clock.fixed(now, ZoneOffset.UTC),
        )

        val batches = planner.readBatches(CONNECTION_ID)

        assertEquals(Instant.parse("2026-09-18T10:00:00Z"), reader.startTime)
        assertEquals(now, reader.endTime)
        assertEquals(listOf(listOf(samsung)), batches)
    }

    private fun sleepSample(id: String, source: String) = HealthConnectSleepSample(
        recordId = id,
        periodStart = Instant.parse("2026-09-18T21:30:00Z"),
        periodEnd = Instant.parse("2026-09-19T05:30:00Z"),
        stages = emptyList(),
        sourcePackageName = source,
        sourceRecordModifiedAt = Instant.parse("2026-09-19T05:31:00Z"),
    )

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
        const val SAMSUNG_HEALTH_PACKAGE = "com.sec.android.app.shealth"
    }
}

private class RecordingSleepReader(
    private val samples: List<HealthConnectSleepSample>,
) : HealthConnectSleepReader {
    var startTime: Instant? = null
    var endTime: Instant? = null

    override suspend fun readSleepSamples(startTime: Instant, endTime: Instant): List<HealthConnectSleepSample> {
        this.startTime = startTime
        this.endTime = endTime
        return samples
    }
}

private class FixedSleepCursorStore(private val cursor: Instant?) : WeightSyncCursorStore {
    override suspend fun read(connectionId: String): Instant? = cursor
    override suspend fun write(connectionId: String, cursor: Instant) = Unit
    override suspend fun remove(connectionId: String) = Unit
}
