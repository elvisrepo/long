package com.viridiandome.longevity.wearables.sync

import java.time.Clock

/** Advances an incremental watermark only after a fully successful sync. */
class IncrementalWeightSyncRunner(
    private val delegate: WeightSyncRunner,
    private val cursorStore: WeightSyncCursorStore,
    private val clock: Clock = Clock.systemUTC(),
) : WeightSyncRunner {
    override suspend fun sync(connectionId: String): WeightSyncResult {
        // Capture the upper safe watermark before reading. Even if new device
        // data appears during this run, the next overlapping window can see it.
        val runStartedAt = clock.instant()
        val result = delegate.sync(connectionId)

        when (result) {
            is WeightSyncResult.Completed,
            WeightSyncResult.NoData,
            -> cursorStore.write(connectionId, runStartedAt)

            is WeightSyncResult.Interrupted -> Unit
        }

        return result
    }
}
