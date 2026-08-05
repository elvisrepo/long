package com.viridiandome.longevity.wearables

import java.time.Instant

/** Device-neutral weight data read from one Health Connect WeightRecord. */
data class HealthConnectWeightSample(
    // Stable Health Connect identity used to build backend record deduplication.
    val recordId: String,
    val kilograms: Double,
    val recordedAt: Instant,
    // Health Connect identifies the app that originally wrote this record.
    val sourcePackageName: String,
) {
    /** Prevent accidental health-data disclosure through logs and exceptions. */
    override fun toString(): String = "HealthConnectWeightSample(<redacted>)"
}
