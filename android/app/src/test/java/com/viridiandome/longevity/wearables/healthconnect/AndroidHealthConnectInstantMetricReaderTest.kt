package com.viridiandome.longevity.wearables.healthconnect

import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.response.ReadRecordsResponse
import com.viridiandome.longevity.wearables.HealthConnectInstantMetric
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class AndroidHealthConnectInstantMetricReaderTest {
    @Test
    fun resting_heart_rate_record_maps_to_bpm_sample() = runTest {
        val recordedAt = Instant.parse("2026-09-28T06:00:00Z")
        val record = RestingHeartRateRecord(
            time = recordedAt,
            zoneOffset = null,
            beatsPerMinute = 58,
            metadata = Metadata.manualEntryWithId("resting-hr-123"),
        )

        val samples = readHealthConnectRestingHeartRateSamples(
            startTime = recordedAt.minusSeconds(60),
            endTime = recordedAt.plusSeconds(60),
            readPage = {
                ReadRecordsResponse(listOf(record), pageToken = null)
            },
        )

        val sample = samples.single()
        assertEquals(HealthConnectInstantMetric.RESTING_HEART_RATE, sample.metric)
        assertEquals("resting-hr-123", sample.recordId)
        assertEquals(58.0, sample.value, 0.0)
        assertEquals(recordedAt, sample.recordedAt)
        assertEquals(record.metadata.lastModifiedTime, sample.sourceRecordModifiedAt)
    }

    @Test
    fun hrv_rmssd_record_maps_to_millisecond_sample() = runTest {
        val recordedAt = Instant.parse("2026-09-28T06:05:00Z")
        val record = HeartRateVariabilityRmssdRecord(
            time = recordedAt,
            zoneOffset = null,
            heartRateVariabilityMillis = 42.5,
            metadata = Metadata.manualEntryWithId("hrv-123"),
        )

        val samples = readHealthConnectHrvSamples(
            startTime = recordedAt.minusSeconds(60),
            endTime = recordedAt.plusSeconds(60),
            readPage = {
                ReadRecordsResponse(listOf(record), pageToken = null)
            },
        )

        val sample = samples.single()
        assertEquals(HealthConnectInstantMetric.HRV_RMSSD, sample.metric)
        assertEquals("hrv-123", sample.recordId)
        assertEquals(42.5, sample.value, 0.0)
        assertEquals(recordedAt, sample.recordedAt)
        assertEquals(record.metadata.lastModifiedTime, sample.sourceRecordModifiedAt)
    }
}
