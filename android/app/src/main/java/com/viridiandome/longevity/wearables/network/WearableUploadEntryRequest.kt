package com.viridiandome.longevity.wearables.network

import com.viridiandome.longevity.wearables.HealthConnectStepsSample
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** One normalized Samsung Health weight record accepted by Django. */
@Serializable
internal data class WearableUploadEntryRequest(
    @SerialName("metric_definition")
    val metricDefinition: String,
    val value: Double,
    @SerialName("period_start")
    val periodStart: String? = null,
    @SerialName("recorded_at")
    val recordedAt: String,
    val source: String,
    @SerialName("external_source_id")
    val externalSourceId: String,
) {
    companion object {
        /** Map a sample already selected by the active weight-sync planner. */
        fun from(sample: HealthConnectWeightSample): WearableUploadEntryRequest =
            WearableUploadEntryRequest(
                metricDefinition = BODY_WEIGHT_METRIC,
                value = sample.kilograms,
                recordedAt = sample.recordedAt.toString(),
                source = SAMSUNG_HEALTH_SOURCE,
                externalSourceId = "$HEALTH_CONNECT_WEIGHT_PREFIX${sample.recordId}",
            )

        /** Map one interval selected by the active Steps sync planner. */
        fun from(sample: HealthConnectStepsSample): WearableUploadEntryRequest =
            WearableUploadEntryRequest(
                metricDefinition = STEPS_METRIC,
                value = sample.count.toDouble(),
                periodStart = sample.periodStart.toString(),
                recordedAt = sample.periodEnd.toString(),
                source = SAMSUNG_HEALTH_SOURCE,
                externalSourceId = "$HEALTH_CONNECT_STEPS_PREFIX${sample.recordId}",
            )

        private const val BODY_WEIGHT_METRIC = "body_weight"
        private const val STEPS_METRIC = "steps"
        private const val SAMSUNG_HEALTH_SOURCE = "samsung_health"
        private const val HEALTH_CONNECT_WEIGHT_PREFIX =
            "health_connect:WeightRecord:"
        private const val HEALTH_CONNECT_STEPS_PREFIX =
            "health_connect:StepsRecord:"
    }

    override fun toString(): String =
        "WearableUploadEntryRequest(metricDefinition=$metricDefinition, " +
            "value=<redacted>, recordedAt=<redacted>, source=$source, " +
            "externalSourceId=<redacted>)"
}
