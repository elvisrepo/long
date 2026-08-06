package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectWeightReader
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class InitialWeightSyncPlannerTest {
    @Test
    fun initial_read_uses_thirty_day_window_and_keeps_only_samsung_health() = runTest {
        val now = Instant.parse("2026-08-05T12:00:00Z")
        val samsungSample = weightSample(
            id = "samsung-record",
            sourcePackageName = "com.sec.android.app.shealth",
        )
        val otherSample = weightSample(
            id = "other-record",
            sourcePackageName = "com.example.otherhealthapp",
        )
        val reader = RecordingWeightReader(
            samples = listOf(samsungSample, otherSample),
        )
        val planner = InitialWeightSyncPlanner(
            reader = reader,
            clock = Clock.fixed(now, ZoneOffset.UTC),
        )

        val batches = planner.readBatches(CONNECTION_ID)

        assertEquals(Instant.parse("2026-07-06T12:00:00Z"), reader.startTime)
        assertEquals(now, reader.endTime)
        assertEquals(listOf(listOf(samsungSample)), batches)
    }

    @Test
    fun samsung_samples_are_split_into_backend_sized_batches_without_reordering() = runTest {
        val samples = (1..101).map { index ->
            weightSample(
                id = "record-$index",
                sourcePackageName = "com.sec.android.app.shealth",
            )
        }
        val planner = InitialWeightSyncPlanner(
            reader = RecordingWeightReader(samples),
            clock = Clock.fixed(
                Instant.parse("2026-08-05T12:00:00Z"),
                ZoneOffset.UTC,
            ),
        )

        val batches = planner.readBatches(CONNECTION_ID)

        assertEquals(listOf(100, 1), batches.map { it.size })
        assertEquals("record-1", batches.first().first().recordId)
        assertEquals("record-100", batches.first().last().recordId)
        assertEquals("record-101", batches.last().single().recordId)
    }

    @Test
    fun no_samsung_samples_produce_no_upload_batches() = runTest {
        val planner = InitialWeightSyncPlanner(
            reader = RecordingWeightReader(
                samples = listOf(
                    weightSample(
                        id = "other-record",
                        sourcePackageName = "com.example.otherhealthapp",
                    ),
                ),
            ),
            clock = Clock.fixed(
                Instant.parse("2026-08-05T12:00:00Z"),
                ZoneOffset.UTC,
            ),
        )

        val batches = planner.readBatches(CONNECTION_ID)

        assertEquals(emptyList<List<HealthConnectWeightSample>>(), batches)
    }

    private fun weightSample(
        id: String,
        sourcePackageName: String,
    ): HealthConnectWeightSample = HealthConnectWeightSample(
        recordId = id,
        kilograms = 78.4,
        recordedAt = Instant.parse("2026-08-04T07:30:00Z"),
        sourcePackageName = sourcePackageName,
    )

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
    }
}

private class RecordingWeightReader(
    private val samples: List<HealthConnectWeightSample>,
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
