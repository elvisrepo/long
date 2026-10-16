package com.viridiandome.longevity.wearables.healthconnect

import com.viridiandome.longevity.wearables.HealthConnectActivityMetric
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class HealthConnectActivityAggregateReaderTest {
    @Test
    fun platform_permission_and_transport_failures_are_not_silently_zeroed() = runTest {
        val start = Instant.parse("2026-10-15T21:45:00Z")
        val end = start.plusSeconds(900)
        val denied = runCatching {
            readHealthConnectActivityAggregateSamples(HealthConnectActivityMetric.TOTAL_CALORIES, start, end) { _, _, _ ->
                throw SecurityException()
            }
        }.exceptionOrNull()
        val unavailable = runCatching {
            readHealthConnectActivityAggregateSamples(HealthConnectActivityMetric.TOTAL_CALORIES, start, end) { _, _, _ ->
                throw java.io.IOException()
            }
        }.exceptionOrNull()
        assertTrue(denied is com.viridiandome.longevity.wearables.ActivityReadPermissionRequiredException)
        assertTrue(unavailable is com.viridiandome.longevity.wearables.ActivityReadUnavailableException)
    }

    @Test
    fun snapshots_use_platform_values_and_explicitly_clear_empty_buckets() = runTest {
        val start = Instant.parse("2026-10-15T21:48:00Z")
        val end = Instant.parse("2026-10-15T22:20:00Z")
        val samples = readHealthConnectActivityAggregateSamples(
            HealthConnectActivityMetric.DISTANCE, start, end,
        ) { metric, from, to ->
            assertEquals(HealthConnectActivityMetric.DISTANCE, metric)
            assertEquals(Instant.parse("2026-10-15T21:45:00Z"), from)
            assertEquals(end, to)
            listOf(ActivityAggregateBucket(from, 5.5))
        }
        assertEquals(3, samples.size)
        assertEquals(5.5, samples.first().value, 0.000001)
        assertTrue(samples.first().hasData)
        assertNull(samples.first().sourcePackageName)
        assertTrue(samples.all { it.isAggregate })
        assertEquals(Instant.parse("2026-10-15T22:00:00Z"), samples.first().periodEnd)
        assertEquals(0.0, samples[1].value, 0.0)
        assertFalse(samples[1].hasData)
        assertEquals(end, samples.last().periodEnd)
        assertEquals(end, samples.first().sourceRecordModifiedAt)
    }
}
