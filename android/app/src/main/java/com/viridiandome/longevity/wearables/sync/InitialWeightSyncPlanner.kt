package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectWeightReader
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import java.time.Clock
import java.time.Duration

/** Selects Fitbit samples for the first bounded device sync. */
class InitialWeightSyncPlanner(
    private val reader: HealthConnectWeightReader,
    private val clock: Clock = Clock.systemUTC(),
) : WeightSyncBatchPlanner {
    override suspend fun readBatches(
        connectionId: String,
    ): List<List<HealthConnectWeightSample>> {
        val endTime = clock.instant()
        val startTime = endTime.minus(INITIAL_LOOKBACK)
        val fitbitSamples = reader.readWeightSamples(
            startTime = startTime,
            endTime = endTime,
        ).filter { sample ->
            sample.sourcePackageName == HealthConnectDataOrigin.FITBIT_PACKAGE_NAME
        }

        return fitbitSamples.chunked(MAX_UPLOAD_ENTRIES)
    }

    private companion object {
        val INITIAL_LOOKBACK: Duration = Duration.ofDays(30)
        const val MAX_UPLOAD_ENTRIES = 100
    }
}
