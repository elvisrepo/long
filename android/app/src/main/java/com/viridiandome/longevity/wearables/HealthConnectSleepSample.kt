package com.viridiandome.longevity.wearables

import java.time.Duration
import java.time.Instant

/** Sleep stage kinds retained only long enough to derive time asleep. */
enum class SleepStageKind {
    UNKNOWN,
    AWAKE,
    SLEEPING,
    OUT_OF_BED,
    LIGHT,
    DEEP,
    REM,
    AWAKE_IN_BED,
    ;

    val isExplicitlyAwake: Boolean
        get() = this == AWAKE || this == OUT_OF_BED || this == AWAKE_IN_BED
}

/** Device-neutral interval for one stage within a sleep session. */
data class HealthConnectSleepStage(
    val periodStart: Instant,
    val periodEnd: Instant,
    val kind: SleepStageKind,
)

/** Device-neutral sleep session read from one Health Connect record. */
data class HealthConnectSleepSample(
    val recordId: String,
    val periodStart: Instant,
    val periodEnd: Instant,
    val stages: List<HealthConnectSleepStage>,
    val sourcePackageName: String,
    val sourceRecordModifiedAt: Instant,
) {
    /** Fall back to session duration and remove only explicit awake periods. */
    val timeAsleepHours: Double
        get() {
            val sessionDuration = Duration.between(periodStart, periodEnd)
            val explicitlyAwake = stages
                .asSequence()
                .filter { it.kind.isExplicitlyAwake }
                .map { Duration.between(it.periodStart, it.periodEnd) }
                .fold(Duration.ZERO, Duration::plus)
            return (sessionDuration - explicitlyAwake).toMillis() / MILLIS_PER_HOUR
        }

    /** Prevent accidental health-data disclosure through logs and exceptions. */
    override fun toString(): String = "HealthConnectSleepSample(<redacted>)"

    private companion object {
        const val MILLIS_PER_HOUR = 3_600_000.0
    }
}
