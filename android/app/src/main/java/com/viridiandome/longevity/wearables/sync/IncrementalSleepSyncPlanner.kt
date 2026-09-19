package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectSleepReader
import com.viridiandome.longevity.wearables.HealthConnectSleepSample
import java.time.Clock
import java.time.Duration

/** Selects recent Samsung Health sleep sessions using the shared sync cursor. */
class IncrementalSleepSyncPlanner(
    private val reader: HealthConnectSleepReader,
    private val cursorStore: WeightSyncCursorStore,
    private val clock: Clock = Clock.systemUTC(),
) : SleepSyncBatchPlanner {
    override suspend fun readBatches(connectionId: String): List<List<HealthConnectSleepSample>> {
        val endTime = clock.instant()
        val startTime = cursorStore.read(connectionId)?.minus(SAFETY_OVERLAP)
            ?: endTime.minus(FALLBACK_LOOKBACK)
        return reader.readSleepSamples(startTime, endTime)
            .filter { it.sourcePackageName == SAMSUNG_HEALTH_PACKAGE_NAME }
            .chunked(MAX_UPLOAD_ENTRIES)
    }

    private companion object {
        val SAFETY_OVERLAP: Duration = Duration.ofHours(24)
        val FALLBACK_LOOKBACK: Duration = Duration.ofDays(30)
        const val MAX_UPLOAD_ENTRIES = 100
        const val SAMSUNG_HEALTH_PACKAGE_NAME = "com.sec.android.app.shealth"
    }
}
