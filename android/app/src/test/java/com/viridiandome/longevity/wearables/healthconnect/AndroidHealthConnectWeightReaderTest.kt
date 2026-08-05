package com.viridiandome.longevity.wearables.healthconnect

import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.response.ReadRecordsResponse
import androidx.health.connect.client.units.Mass
import com.viridiandome.longevity.wearables.WeightReadPermissionRequiredException
import com.viridiandome.longevity.wearables.WeightReadUnavailableException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.Instant

class AndroidHealthConnectWeightReaderTest {
    @Test
    fun sdk_record_is_read_for_the_requested_window_and_mapped_to_domain() = runTest {
        val startTime = Instant.parse("2026-08-04T00:00:00Z")
        val endTime = Instant.parse("2026-08-05T00:00:00Z")
        val recordedAt = Instant.parse("2026-08-04T07:30:00Z")
        val record = WeightRecord(
            time = recordedAt,
            zoneOffset = null,
            weight = Mass.kilograms(78.4),
            metadata = Metadata.manualEntryWithId("weight-record-123"),
        )

        val samples = readHealthConnectWeightSamples(
            startTime = startTime,
            endTime = endTime,
            readPage = { request ->
                assertEquals(WeightRecord::class, request.recordType)
                assertEquals(startTime, request.timeRangeFilter.startTime)
                assertEquals(endTime, request.timeRangeFilter.endTime)
                assertTrue(request.ascendingOrder)
                ReadRecordsResponse(
                    records = listOf(record),
                    pageToken = null,
                )
            },
        )

        assertEquals(1, samples.size)
        assertEquals("weight-record-123", samples.single().recordId)
        assertEquals(78.4, samples.single().kilograms, 0.0)
        assertEquals(recordedAt, samples.single().recordedAt)
        assertEquals(
            record.metadata.dataOrigin.packageName,
            samples.single().sourcePackageName,
        )
    }

    @Test
    fun every_page_is_read_until_health_connect_returns_no_page_token() = runTest {
        val requests = mutableListOf<String?>()
        val firstRecord = weightRecord(
            id = "record-1",
            kilograms = 78.4,
            recordedAt = "2026-08-04T07:30:00Z",
        )
        val secondRecord = weightRecord(
            id = "record-2",
            kilograms = 78.2,
            recordedAt = "2026-08-04T19:30:00Z",
        )

        val samples = readHealthConnectWeightSamples(
            startTime = Instant.parse("2026-08-04T00:00:00Z"),
            endTime = Instant.parse("2026-08-05T00:00:00Z"),
            readPage = { request ->
                requests += request.pageToken
                when (request.pageToken) {
                    null -> ReadRecordsResponse(
                        records = listOf(firstRecord),
                        pageToken = "next-page",
                    )

                    "next-page" -> ReadRecordsResponse(
                        records = listOf(secondRecord),
                        pageToken = null,
                    )

                    else -> error("Unexpected page token")
                }
            },
        )

        assertEquals(listOf(null, "next-page"), requests)
        assertEquals(listOf("record-1", "record-2"), samples.map { it.recordId })
    }

    @Test
    fun revoked_permission_is_translated_to_domain_read_failure() = runTest {
        val failure = runCatching {
            readHealthConnectWeightSamples(
                startTime = Instant.parse("2026-08-04T00:00:00Z"),
                endTime = Instant.parse("2026-08-05T00:00:00Z"),
                readPage = { throw SecurityException("permission revoked") },
            )
        }.exceptionOrNull()

        assertTrue(failure is WeightReadPermissionRequiredException)
    }

    @Test
    fun health_connect_io_failure_is_translated_to_domain_unavailability() = runTest {
        val failure = runCatching {
            readHealthConnectWeightSamples(
                startTime = Instant.parse("2026-08-04T00:00:00Z"),
                endTime = Instant.parse("2026-08-05T00:00:00Z"),
                readPage = { throw IOException("provider unavailable") },
            )
        }.exceptionOrNull()

        assertTrue(failure is WeightReadUnavailableException)
    }

    private fun weightRecord(
        id: String,
        kilograms: Double,
        recordedAt: String,
    ): WeightRecord = WeightRecord(
        time = Instant.parse(recordedAt),
        zoneOffset = null,
        weight = Mass.kilograms(kilograms),
        metadata = Metadata.manualEntryWithId(id),
    )
}
