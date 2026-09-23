package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectWeightSample

/** Supplies ordered, backend-sized weight batches for one sync window. */
fun interface WeightSyncBatchPlanner {
    suspend fun readBatches(
        connectionId: String,
    ): List<List<HealthConnectWeightSample>>
}
