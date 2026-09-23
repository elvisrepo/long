package com.viridiandome.longevity.wearables

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class HealthConnectSleepSampleTest {
    @Test
    fun session_without_stages_uses_full_session_duration() {
        val sample = sample(stages = emptyList())

        assertEquals(8.0, sample.timeAsleepHours, 0.000_001)
    }

    @Test
    fun explicit_awake_and_out_of_bed_stages_are_removed_from_duration() {
        val sample = sample(
            stages = listOf(
                stage("2026-09-18T23:00:00Z", "2026-09-18T23:30:00Z", SleepStageKind.AWAKE),
                stage("2026-09-19T03:00:00Z", "2026-09-19T03:15:00Z", SleepStageKind.OUT_OF_BED),
                stage("2026-09-19T05:00:00Z", "2026-09-19T05:15:00Z", SleepStageKind.AWAKE_IN_BED),
            ),
        )

        assertEquals(7.0, sample.timeAsleepHours, 0.000_001)
    }

    private fun sample(
        stages: List<HealthConnectSleepStage>,
    ): HealthConnectSleepSample =
        HealthConnectSleepSample(
            recordId = "sleep-123",
            periodStart = Instant.parse("2026-09-18T21:30:00Z"),
            periodEnd = Instant.parse("2026-09-19T05:30:00Z"),
            stages = stages,
            sourcePackageName = "com.sec.android.app.shealth",
            sourceRecordModifiedAt = Instant.parse("2026-09-19T05:35:00Z"),
        )

    private fun stage(
        start: String,
        end: String,
        kind: SleepStageKind,
    ): HealthConnectSleepStage =
        HealthConnectSleepStage(
            periodStart = Instant.parse(start),
            periodEnd = Instant.parse(end),
            kind = kind,
        )
}
