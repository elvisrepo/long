package com.viridiandome.longevity.wearables.healthconnect

import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.response.ReadRecordsResponse
import androidx.health.connect.client.units.Length
import androidx.health.connect.client.units.Energy
import com.viridiandome.longevity.wearables.HealthConnectActivityMetric
import com.viridiandome.longevity.wearables.ActivityReadPermissionRequiredException
import com.viridiandome.longevity.wearables.ActivityReadUnavailableException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class AndroidHealthConnectActivityReaderTest {
    @Test
    fun total_calories_are_a_distinct_record_type_with_fractional_kcal() = runTest {
        val start = Instant.parse("2026-10-16T08:00:00Z")
        val end = start.plusSeconds(60)
        val record = TotalCaloriesBurnedRecord(
            startTime = start, startZoneOffset = null, endTime = end, endZoneOffset = null,
            energy = Energy.kilocalories(125.3), metadata = Metadata.manualEntryWithId("total-1"),
        )
        val sample = readHealthConnectTotalCaloriesSamples(start, end) { request ->
            assertEquals(TotalCaloriesBurnedRecord::class, request.recordType)
            ReadRecordsResponse(listOf(record), null)
        }.single()
        assertEquals(HealthConnectActivityMetric.TOTAL_CALORIES, sample.metric)
        assertEquals(125.3, sample.value, 0.000001)
        assertEquals("total-1", sample.recordId)
        assertEquals(record.metadata.lastModifiedTime, sample.sourceRecordModifiedAt)
    }

    @Test
    fun permission_loss_and_temporary_failures_remain_distinct() = runTest {
        val start = Instant.parse("2026-10-16T08:00:00Z")
        val end = start.plusSeconds(60)
        val denied = runCatching {
            readHealthConnectDistanceSamples(start, end) { throw SecurityException() }
        }.exceptionOrNull()
        val unavailable = runCatching {
            readHealthConnectTotalCaloriesSamples(start, end) { throw java.io.IOException() }
        }.exceptionOrNull()
        assertTrue(denied is ActivityReadPermissionRequiredException)
        assertTrue(unavailable is ActivityReadUnavailableException)
    }

    @Test
    fun distance_reads_every_page_and_converts_metres_to_kilometres() = runTest {
        val start = Instant.parse("2026-10-16T08:00:00Z")
        val end = start.plusSeconds(60)
        val record = DistanceRecord(
            startTime = start, startZoneOffset = null,
            endTime = end, endZoneOffset = null,
            distance = Length.meters(491.0),
            metadata = Metadata.manualEntryWithId("distance-1"),
        )
        val tokens = mutableListOf<String?>()
        val samples = readHealthConnectDistanceSamples(start, end) { request ->
            assertEquals(DistanceRecord::class, request.recordType)
            assertEquals(start, request.timeRangeFilter.startTime)
            assertEquals(end, request.timeRangeFilter.endTime)
            assertTrue(request.ascendingOrder)
            tokens += request.pageToken
            ReadRecordsResponse(
                records = if (request.pageToken == null) listOf(record) else emptyList(),
                pageToken = if (request.pageToken == null) "page-2" else null,
            )
        }
        assertEquals(listOf(null, "page-2"), tokens)
        val sample = samples.single()
        assertEquals(HealthConnectActivityMetric.DISTANCE, sample.metric)
        assertEquals(0.491, sample.value, 0.000001)
        assertEquals("distance-1", sample.recordId)
        assertEquals(start, sample.periodStart)
        assertEquals(end, sample.periodEnd)
        assertEquals(record.metadata.dataOrigin.packageName, sample.sourcePackageName)
        assertEquals(record.metadata.lastModifiedTime, sample.sourceRecordModifiedAt)
    }
}
