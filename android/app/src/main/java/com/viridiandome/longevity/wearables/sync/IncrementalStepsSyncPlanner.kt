package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectStepsReader
import com.viridiandome.longevity.wearables.HealthConnectStepsSample
import java.time.Clock
import java.time.Duration

/** Selects recent Fitbit Steps records using the connection cursor. */
class IncrementalStepsSyncPlanner(
    private val reader: HealthConnectStepsReader,
    private val cursorStore: WeightSyncCursorStore,
    private val clock: Clock = Clock.systemUTC(),
) : StepsSyncBatchPlanner {
    override suspend fun readBatches(
        connectionId: String,
    ): List<List<HealthConnectStepsSample>> {
        val endTime = clock.instant()
        val cursor = cursorStore.read(connectionId)
        val startTime = cursor?.minus(SAFETY_OVERLAP)
            ?: endTime.minus(FALLBACK_LOOKBACK)
        val fitbitSamples = reader.readStepsSamples(
            startTime = startTime,
            endTime = endTime,
        ).filter { sample ->
            sample.sourcePackageName == HealthConnectDataOrigin.FITBIT_PACKAGE_NAME
        }

        return fitbitSamples.chunked(MAX_UPLOAD_ENTRIES)
    }

    private companion object {
        val SAFETY_OVERLAP: Duration = Duration.ofHours(24)
        val FALLBACK_LOOKBACK: Duration = Duration.ofDays(30)
        const val MAX_UPLOAD_ENTRIES = 100
    }
}
