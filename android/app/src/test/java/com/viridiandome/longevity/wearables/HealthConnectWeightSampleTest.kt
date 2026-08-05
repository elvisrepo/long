package com.viridiandome.longevity.wearables

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.time.Instant

class HealthConnectWeightSampleTest {
    @Test
    fun sample_preserves_values_needed_for_normalized_upload() {
        val recordedAt = Instant.parse("2026-08-05T07:30:00Z")

        val sample = HealthConnectWeightSample(
            recordId = "health-connect-weight-record-123",
            kilograms = 78.4,
            recordedAt = recordedAt,
            sourcePackageName = "com.sec.android.app.shealth",
        )

        assertEquals("health-connect-weight-record-123", sample.recordId)
        assertEquals(78.4, sample.kilograms, 0.0)
        assertEquals(recordedAt, sample.recordedAt)
        assertEquals("com.sec.android.app.shealth", sample.sourcePackageName)
    }

    @Test
    fun diagnostic_string_does_not_expose_health_record_values() {
        val sample = HealthConnectWeightSample(
            recordId = "private-record-id",
            kilograms = 78.4,
            recordedAt = Instant.parse("2026-08-05T07:30:00Z"),
            sourcePackageName = "private.source.package",
        )

        val diagnostic = sample.toString()

        assertFalse(diagnostic.contains("private-record-id"))
        assertFalse(diagnostic.contains("78.4"))
        assertFalse(diagnostic.contains("2026-08-05"))
        assertFalse(diagnostic.contains("private.source.package"))
    }

    @Test
    fun reader_contract_uses_an_explicit_time_window() = runTest {
        val startTime = Instant.parse("2026-08-04T00:00:00Z")
        val endTime = Instant.parse("2026-08-05T00:00:00Z")
        val expected = listOf(
            HealthConnectWeightSample(
                recordId = "record-123",
                kilograms = 78.4,
                recordedAt = Instant.parse("2026-08-04T07:30:00Z"),
                sourcePackageName = "com.sec.android.app.shealth",
            ),
        )
        val reader = RecordingHealthConnectWeightReader(expected)

        val result = reader.readWeightSamples(
            startTime = startTime,
            endTime = endTime,
        )

        assertEquals(startTime, reader.startTime)
        assertEquals(endTime, reader.endTime)
        assertEquals(expected, result)
    }
}

private class RecordingHealthConnectWeightReader(
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
