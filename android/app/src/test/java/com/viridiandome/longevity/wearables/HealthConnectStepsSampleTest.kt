package com.viridiandome.longevity.wearables

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.time.Instant

class HealthConnectStepsSampleTest {
    @Test
    fun sample_preserves_values_needed_for_normalized_upload() {
        val periodStart = Instant.parse("2026-08-05T07:15:00Z")
        val periodEnd = Instant.parse("2026-08-05T07:30:00Z")

        val sample = HealthConnectStepsSample(
            recordId = "health-connect-steps-record-123",
            count = 420,
            periodStart = periodStart,
            periodEnd = periodEnd,
            sourcePackageName = "com.sec.android.app.shealth",
        )

        assertEquals("health-connect-steps-record-123", sample.recordId)
        assertEquals(420, sample.count)
        assertEquals(periodStart, sample.periodStart)
        assertEquals(periodEnd, sample.periodEnd)
        assertEquals("com.sec.android.app.shealth", sample.sourcePackageName)
    }

    @Test
    fun diagnostic_string_does_not_expose_health_record_values() {
        val sample = HealthConnectStepsSample(
            recordId = "private-record-id",
            count = 420,
            periodStart = Instant.parse("2026-08-05T07:15:00Z"),
            periodEnd = Instant.parse("2026-08-05T07:30:00Z"),
            sourcePackageName = "private.source.package",
        )

        val diagnostic = sample.toString()

        assertFalse(diagnostic.contains("private-record-id"))
        assertFalse(diagnostic.contains("420"))
        assertFalse(diagnostic.contains("2026-08-05"))
        assertFalse(diagnostic.contains("private.source.package"))
    }

    @Test
    fun reader_contract_uses_an_explicit_time_window() = runTest {
        val startTime = Instant.parse("2026-08-04T00:00:00Z")
        val endTime = Instant.parse("2026-08-05T00:00:00Z")
        val expected = listOf(
            HealthConnectStepsSample(
                recordId = "record-123",
                count = 420,
                periodStart = Instant.parse("2026-08-04T07:15:00Z"),
                periodEnd = Instant.parse("2026-08-04T07:30:00Z"),
                sourcePackageName = "com.sec.android.app.shealth",
            ),
        )
        val reader = RecordingHealthConnectStepsReader(expected)

        val result = reader.readStepsSamples(
            startTime = startTime,
            endTime = endTime,
        )

        assertEquals(startTime, reader.startTime)
        assertEquals(endTime, reader.endTime)
        assertEquals(expected, result)
    }
}

private class RecordingHealthConnectStepsReader(
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
