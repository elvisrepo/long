package com.viridiandome.longevity.wearables.healthconnect

import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.response.ReadRecordsResponse
import com.viridiandome.longevity.wearables.StepsReadPermissionRequiredException
import com.viridiandome.longevity.wearables.StepsReadUnavailableException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.Instant

class AndroidHealthConnectStepsReaderTest {
    @Test
    fun sdk_record_is_read_for_the_requested_window_and_mapped_to_domain() = runTest {
        val startTime = Instant.parse("2026-08-04T00:00:00Z")
        val endTime = Instant.parse("2026-08-05T00:00:00Z")
        val periodStart = Instant.parse("2026-08-04T07:15:00Z")
        val periodEnd = Instant.parse("2026-08-04T07:30:00Z")
        val record = StepsRecord(
            startTime = periodStart,
            startZoneOffset = null,
            endTime = periodEnd,
            endZoneOffset = null,
            count = 420,
            metadata = Metadata.manualEntryWithId("steps-record-123"),
        )

        val samples = readHealthConnectStepsSamples(
            startTime = startTime,
            endTime = endTime,
            readPage = { request ->
                assertEquals(StepsRecord::class, request.recordType)
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
        assertEquals("steps-record-123", samples.single().recordId)
        assertEquals(420, samples.single().count)
        assertEquals(periodStart, samples.single().periodStart)
        assertEquals(periodEnd, samples.single().periodEnd)
        assertEquals(
            record.metadata.dataOrigin.packageName,
            samples.single().sourcePackageName,
        )
    }

    @Test
    fun every_page_is_read_until_health_connect_returns_no_page_token() = runTest {
        val requests = mutableListOf<String?>()
        val firstRecord = stepsRecord(
            id = "record-1",
            count = 200,
            periodStart = "2026-08-04T07:00:00Z",
            periodEnd = "2026-08-04T07:15:00Z",
        )
        val secondRecord = stepsRecord(
            id = "record-2",
            count = 220,
            periodStart = "2026-08-04T07:15:00Z",
            periodEnd = "2026-08-04T07:30:00Z",
        )

        val samples = readHealthConnectStepsSamples(
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
            readHealthConnectStepsSamples(
                startTime = Instant.parse("2026-08-04T00:00:00Z"),
                endTime = Instant.parse("2026-08-05T00:00:00Z"),
                readPage = { throw SecurityException("permission revoked") },
            )
        }.exceptionOrNull()

        assertTrue(failure is StepsReadPermissionRequiredException)
    }

    @Test
    fun health_connect_io_failure_is_translated_to_domain_unavailability() = runTest {
        val failure = runCatching {
            readHealthConnectStepsSamples(
                startTime = Instant.parse("2026-08-04T00:00:00Z"),
                endTime = Instant.parse("2026-08-05T00:00:00Z"),
                readPage = { throw IOException("provider unavailable") },
            )
        }.exceptionOrNull()

        assertTrue(failure is StepsReadUnavailableException)
    }

    private fun stepsRecord(
        id: String,
        count: Long,
        periodStart: String,
        periodEnd: String,
    ): StepsRecord = StepsRecord(
        startTime = Instant.parse(periodStart),
        startZoneOffset = null,
        endTime = Instant.parse(periodEnd),
        endZoneOffset = null,
        count = count,
        metadata = Metadata.manualEntryWithId(id),
    )
}
