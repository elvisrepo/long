package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectWeightReader
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import java.time.Clock
import java.time.Duration

/** Selects Samsung Health samples for the first bounded device sync. */
class InitialWeightSyncPlanner(
    private val reader: HealthConnectWeightReader,
    private val clock: Clock = Clock.systemUTC(),
) {
    suspend fun readBatches(): List<List<HealthConnectWeightSample>> {
        val endTime = clock.instant()
        val startTime = endTime.minus(INITIAL_LOOKBACK)
        val samsungSamples = reader.readWeightSamples(
            startTime = startTime,
            endTime = endTime,
        ).filter { sample ->
            sample.sourcePackageName == SAMSUNG_HEALTH_PACKAGE_NAME
        }

        return samsungSamples.chunked(MAX_UPLOAD_ENTRIES)
    }

    private companion object {
        val INITIAL_LOOKBACK: Duration = Duration.ofDays(30)
        const val MAX_UPLOAD_ENTRIES = 100
        const val SAMSUNG_HEALTH_PACKAGE_NAME = "com.sec.android.app.shealth"
    }
}
