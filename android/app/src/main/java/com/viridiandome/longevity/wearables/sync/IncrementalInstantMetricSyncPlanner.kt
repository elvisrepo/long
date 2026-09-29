package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectInstantMetric
import com.viridiandome.longevity.wearables.HealthConnectInstantMetricReader
import com.viridiandome.longevity.wearables.HealthConnectInstantMetricSample
import java.time.Clock
import java.time.Duration

/** Selects one recent Fitbit cardiovascular metric using the shared watermark. */
class IncrementalInstantMetricSyncPlanner(
    private val reader: HealthConnectInstantMetricReader,
    private val metric: HealthConnectInstantMetric,
    private val cursorStore: WeightSyncCursorStore,
    private val clock: Clock = Clock.systemUTC(),
) : InstantMetricSyncBatchPlanner {
    override suspend fun readBatches(
        connectionId: String,
    ): List<List<HealthConnectInstantMetricSample>> {
        val endTime = clock.instant()
        val cursor = cursorStore.read(connectionId)
        val startTime = cursor?.minus(SAFETY_OVERLAP)
            ?: endTime.minus(FALLBACK_LOOKBACK)
        val samples = when (metric) {
            HealthConnectInstantMetric.RESTING_HEART_RATE ->
                reader.readRestingHeartRateSamples(startTime, endTime)

            HealthConnectInstantMetric.HRV_RMSSD ->
                reader.readHrvSamples(startTime, endTime)
        }

        return samples
            .filter { sample ->
                sample.metric == metric &&
                    sample.sourcePackageName == HealthConnectDataOrigin.FITBIT_PACKAGE_NAME
            }
            .chunked(MAX_UPLOAD_ENTRIES)
    }

    private companion object {
        val SAFETY_OVERLAP: Duration = Duration.ofHours(24)
        val FALLBACK_LOOKBACK: Duration = Duration.ofDays(30)
        const val MAX_UPLOAD_ENTRIES = 100
    }
}
