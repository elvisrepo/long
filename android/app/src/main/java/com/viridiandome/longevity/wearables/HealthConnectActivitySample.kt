package com.viridiandome.longevity.wearables

import java.time.Instant

enum class HealthConnectActivityMetric(val metricSlug: String, val recordTypeName: String) {
    DISTANCE("distance", "DistanceRecord"),
    TOTAL_CALORIES("total_calories_burned", "TotalCaloriesBurnedRecord"),
}

/** Normalized interval: kilometres for Distance, kilocalories for total energy. */
data class HealthConnectActivitySample(
    val metric: HealthConnectActivityMetric,
    val recordId: String,
    val value: Double,
    val periodStart: Instant,
    val periodEnd: Instant,
    val sourcePackageName: String?,
    val sourceRecordModifiedAt: Instant,
    val isAggregate: Boolean = false,
    val hasData: Boolean = true,
) {
    override fun toString(): String = "HealthConnectActivitySample(metric=$metric, <redacted>)"
}
