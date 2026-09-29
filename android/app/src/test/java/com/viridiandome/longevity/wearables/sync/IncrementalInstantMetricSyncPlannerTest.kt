package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectInstantMetric
import com.viridiandome.longevity.wearables.HealthConnectInstantMetricReader
import com.viridiandome.longevity.wearables.HealthConnectInstantMetricSample
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class IncrementalInstantMetricSyncPlannerTest {
    @Test
    fun resting_heart_rate_planner_keeps_only_fitbit_rhr_in_cursor_window() = runTest {
        val now = Instant.parse("2026-09-28T12:00:00Z")
        val cursor = Instant.parse("2026-09-28T10:00:00Z")
        val expected = sample(
            id = "rhr-fitbit",
            metric = HealthConnectInstantMetric.RESTING_HEART_RATE,
            sourcePackageName = FITBIT_PACKAGE,
        )
        val reader = RecordingInstantMetricReader(
            restingHeartRateSamples = listOf(
                expected,
                sample(
                    id = "rhr-other",
                    metric = HealthConnectInstantMetric.RESTING_HEART_RATE,
                    sourcePackageName = "com.example.other",
                ),
                sample(
                    id = "wrong-metric",
                    metric = HealthConnectInstantMetric.HRV_RMSSD,
                    sourcePackageName = FITBIT_PACKAGE,
                ),
            ),
        )
        val planner = IncrementalInstantMetricSyncPlanner(
            reader = reader,
            metric = HealthConnectInstantMetric.RESTING_HEART_RATE,
            cursorStore = FixedInstantMetricCursorStore(cursor),
            clock = Clock.fixed(now, ZoneOffset.UTC),
        )

        val batches = planner.readBatches(CONNECTION_ID)

        assertEquals(Instant.parse("2026-09-27T10:00:00Z"), reader.rhrStartTime)
        assertEquals(now, reader.rhrEndTime)
        assertEquals(listOf(listOf(expected)), batches)
        assertEquals(0, reader.hrvReadCount)
    }

    @Test
    fun hrv_planner_uses_initial_30_day_window_and_backend_sized_batches() = runTest {
        val now = Instant.parse("2026-09-28T12:00:00Z")
        val samples = (1..101).map { index ->
            sample(
                id = "hrv-$index",
                metric = HealthConnectInstantMetric.HRV_RMSSD,
                sourcePackageName = FITBIT_PACKAGE,
            )
        }
        val reader = RecordingInstantMetricReader(hrvSamples = samples)
        val planner = IncrementalInstantMetricSyncPlanner(
            reader = reader,
            metric = HealthConnectInstantMetric.HRV_RMSSD,
            cursorStore = FixedInstantMetricCursorStore(cursor = null),
            clock = Clock.fixed(now, ZoneOffset.UTC),
        )

        val batches = planner.readBatches(CONNECTION_ID)

        assertEquals(Instant.parse("2026-08-29T12:00:00Z"), reader.hrvStartTime)
        assertEquals(now, reader.hrvEndTime)
        assertEquals(listOf(100, 1), batches.map(List<*>::size))
        assertEquals("hrv-1", batches.first().first().recordId)
        assertEquals("hrv-101", batches.last().single().recordId)
        assertEquals(0, reader.rhrReadCount)
    }

    private fun sample(
        id: String,
        metric: HealthConnectInstantMetric,
        sourcePackageName: String,
    ): HealthConnectInstantMetricSample = HealthConnectInstantMetricSample(
        metric = metric,
        recordId = id,
        value = 52.0,
        recordedAt = Instant.parse("2026-09-28T08:00:00Z"),
        sourcePackageName = sourcePackageName,
        sourceRecordModifiedAt = Instant.parse("2026-09-28T08:01:00Z"),
    )

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
        const val FITBIT_PACKAGE = "com.fitbit.FitbitMobile"
    }
}

private class RecordingInstantMetricReader(
    private val restingHeartRateSamples: List<HealthConnectInstantMetricSample> = emptyList(),
    private val hrvSamples: List<HealthConnectInstantMetricSample> = emptyList(),
) : HealthConnectInstantMetricReader {
    var rhrStartTime: Instant? = null
        private set
    var rhrEndTime: Instant? = null
        private set
    var hrvStartTime: Instant? = null
        private set
    var hrvEndTime: Instant? = null
        private set
    var rhrReadCount: Int = 0
        private set
    var hrvReadCount: Int = 0
        private set

    override suspend fun readRestingHeartRateSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectInstantMetricSample> {
        rhrReadCount += 1
        rhrStartTime = startTime
        rhrEndTime = endTime
        return restingHeartRateSamples
    }

    override suspend fun readHrvSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectInstantMetricSample> {
        hrvReadCount += 1
        hrvStartTime = startTime
        hrvEndTime = endTime
        return hrvSamples
    }
}

private class FixedInstantMetricCursorStore(
    private val cursor: Instant?,
) : WeightSyncCursorStore {
    override suspend fun read(connectionId: String): Instant? = cursor

    override suspend fun write(connectionId: String, cursor: Instant) = Unit

    override suspend fun remove(connectionId: String) = Unit
}
