package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectSleepSample

/** Supplies ordered, backend-sized Sleep batches for one sync window. */
fun interface SleepSyncBatchPlanner {
    suspend fun readBatches(connectionId: String): List<List<HealthConnectSleepSample>>
}
