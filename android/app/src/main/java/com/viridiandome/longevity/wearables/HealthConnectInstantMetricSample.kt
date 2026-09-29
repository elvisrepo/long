package com.viridiandome.longevity.wearables

import java.time.Instant

enum class HealthConnectInstantMetric(
    val metricSlug: String,
    val recordTypeName: String,
) {
    RESTING_HEART_RATE("resting_hr", "RestingHeartRateRecord"),
    HRV_RMSSD("hrv", "HeartRateVariabilityRmssdRecord"),
}

/** One normalized instantaneous cardiovascular Health Connect record. */
data class HealthConnectInstantMetricSample(
    val metric: HealthConnectInstantMetric,
    val recordId: String,
    val value: Double,
    val recordedAt: Instant,
    val sourcePackageName: String,
    val sourceRecordModifiedAt: Instant,
) {
    override fun toString(): String =
        "HealthConnectInstantMetricSample(metric=$metric, <redacted>)"
}
