package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectWeightReader
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import java.time.Clock
import java.time.Duration

/** Selects recent Samsung Health records using a per-connection watermark. */
class IncrementalWeightSyncPlanner(
    private val reader: HealthConnectWeightReader,
    private val cursorStore: WeightSyncCursorStore,
    private val clock: Clock = Clock.systemUTC(),
) : WeightSyncBatchPlanner {
    override suspend fun readBatches(
        connectionId: String,
    ): List<List<HealthConnectWeightSample>> {
        val endTime = clock.instant()
        val cursor = cursorStore.read(connectionId)
        val startTime = cursor?.minus(SAFETY_OVERLAP)
            ?: endTime.minus(FALLBACK_LOOKBACK)
        val samsungSamples = reader.readWeightSamples(
            startTime = startTime,
            endTime = endTime,
        ).filter { sample ->
            sample.sourcePackageName == SAMSUNG_HEALTH_PACKAGE_NAME
        }

        return samsungSamples.chunked(MAX_UPLOAD_ENTRIES)
    }

    private companion object {
        val SAFETY_OVERLAP: Duration = Duration.ofHours(24)
        val FALLBACK_LOOKBACK: Duration = Duration.ofDays(30)
        const val MAX_UPLOAD_ENTRIES = 100
        const val SAMSUNG_HEALTH_PACKAGE_NAME = "com.sec.android.app.shealth"
    }
}
