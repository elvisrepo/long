package com.viridiandome.longevity.wearables.healthconnect

import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.response.ReadRecordsResponse
import com.viridiandome.longevity.wearables.SleepStageKind
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class AndroidHealthConnectSleepReaderTest {
    @Test
    fun sdk_sleep_session_and_stages_map_to_domain() = runTest {
        val requestedStart = Instant.parse("2026-09-18T00:00:00Z")
        val requestedEnd = Instant.parse("2026-09-19T12:00:00Z")
        val sessionStart = Instant.parse("2026-09-18T21:30:00Z")
        val sessionEnd = Instant.parse("2026-09-19T05:30:00Z")
        val awakeStart = Instant.parse("2026-09-18T23:00:00Z")
        val awakeEnd = Instant.parse("2026-09-18T23:30:00Z")
        val record = SleepSessionRecord(
            startTime = sessionStart,
            startZoneOffset = null,
            endTime = sessionEnd,
            endZoneOffset = null,
            stages = listOf(
                SleepSessionRecord.Stage(
                    startTime = awakeStart,
                    endTime = awakeEnd,
                    stage = SleepSessionRecord.STAGE_TYPE_AWAKE,
                ),
            ),
            metadata = Metadata.manualEntryWithId("sleep-record-123"),
        )

        val samples = readHealthConnectSleepSamples(
            startTime = requestedStart,
            endTime = requestedEnd,
            readPage = { request ->
                assertEquals(SleepSessionRecord::class, request.recordType)
                assertEquals(requestedStart, request.timeRangeFilter.startTime)
                assertEquals(requestedEnd, request.timeRangeFilter.endTime)
                assertTrue(request.ascendingOrder)
                ReadRecordsResponse(records = listOf(record), pageToken = null)
            },
        )

        val sample = samples.single()
        assertEquals("sleep-record-123", sample.recordId)
        assertEquals(sessionStart, sample.periodStart)
        assertEquals(sessionEnd, sample.periodEnd)
        assertEquals(SleepStageKind.AWAKE, sample.stages.single().kind)
        assertEquals(7.5, sample.timeAsleepHours, 0.000_001)
    }
}
