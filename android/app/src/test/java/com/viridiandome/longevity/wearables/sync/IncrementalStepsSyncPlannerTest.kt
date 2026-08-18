package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectStepsReader
import com.viridiandome.longevity.wearables.HealthConnectStepsSample
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class IncrementalStepsSyncPlannerTest {
    @Test
    fun cursor_window_keeps_only_samsung_steps_and_preserves_order() = runTest {
        val now = Instant.parse("2026-08-05T12:00:00Z")
        val cursor = Instant.parse("2026-08-05T10:00:00Z")
        val firstSamsung = stepsSample(
            id = "samsung-1",
            sourcePackageName = SAMSUNG_HEALTH_PACKAGE,
        )
        val other = stepsSample(
            id = "other",
            sourcePackageName = "com.example.otherhealthapp",
        )
        val secondSamsung = stepsSample(
            id = "samsung-2",
            sourcePackageName = SAMSUNG_HEALTH_PACKAGE,
        )
        val reader = RecordingStepsReader(
            listOf(firstSamsung, other, secondSamsung),
        )
        val planner = IncrementalStepsSyncPlanner(
            reader = reader,
            cursorStore = FixedStepsCursorStore(cursor),
            clock = Clock.fixed(now, ZoneOffset.UTC),
        )

        val batches = planner.readBatches(CONNECTION_ID)

        assertEquals(Instant.parse("2026-08-04T10:00:00Z"), reader.startTime)
        assertEquals(now, reader.endTime)
        assertEquals(listOf(listOf(firstSamsung, secondSamsung)), batches)
    }

    @Test
    fun steps_are_split_into_backend_sized_batches_without_reordering() = runTest {
        val samples = (1..101).map { index ->
            stepsSample(
                id = "record-$index",
                sourcePackageName = SAMSUNG_HEALTH_PACKAGE,
            )
        }
        val planner = IncrementalStepsSyncPlanner(
            reader = RecordingStepsReader(samples),
            cursorStore = FixedStepsCursorStore(cursor = null),
            clock = Clock.fixed(
                Instant.parse("2026-08-05T12:00:00Z"),
                ZoneOffset.UTC,
            ),
        )

        val batches = planner.readBatches(CONNECTION_ID)

        assertEquals(listOf(100, 1), batches.map { it.size })
        assertEquals("record-1", batches.first().first().recordId)
        assertEquals("record-101", batches.last().single().recordId)
    }

    private fun stepsSample(
        id: String,
        sourcePackageName: String,
    ): HealthConnectStepsSample = HealthConnectStepsSample(
        recordId = id,
        count = 420,
        periodStart = Instant.parse("2026-08-05T07:45:00Z"),
        periodEnd = Instant.parse("2026-08-05T08:00:00Z"),
        sourcePackageName = sourcePackageName,
        sourceRecordModifiedAt = Instant.parse("2026-08-05T08:01:00Z"),
    )

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
        const val SAMSUNG_HEALTH_PACKAGE = "com.sec.android.app.shealth"
    }
}

private class RecordingStepsReader(
    private val samples: List<HealthConnectStepsSample>,
) : HealthConnectStepsReader {
    var startTime: Instant? = null
        private set
    var endTime: Instant? = null
        private set

    override suspend fun readStepsSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectStepsSample> {
        this.startTime = startTime
        this.endTime = endTime
        return samples
    }
}

private class FixedStepsCursorStore(
    private val cursor: Instant?,
) : WeightSyncCursorStore {
    override suspend fun read(connectionId: String): Instant? = cursor

    override suspend fun write(connectionId: String, cursor: Instant) = Unit

    override suspend fun remove(connectionId: String) = Unit
}
