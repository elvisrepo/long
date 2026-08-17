package com.viridiandome.longevity.wearables

import java.time.Instant

/** Device-neutral step count read from one Health Connect StepsRecord. */
data class HealthConnectStepsSample(
    // Stable Health Connect identity used for backend record deduplication.
    val recordId: String,
    val count: Long,
    val periodStart: Instant,
    val periodEnd: Instant,
    // Health Connect identifies the app that originally wrote this record.
    val sourcePackageName: String,
) {
    /** Prevent accidental health-data disclosure through logs and exceptions. */
    override fun toString(): String = "HealthConnectStepsSample(<redacted>)"
}
