package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectInstantMetricSample

/** Supplies ordered, backend-sized cardiovascular metric batches. */
fun interface InstantMetricSyncBatchPlanner {
    suspend fun readBatches(
        connectionId: String,
    ): List<List<HealthConnectInstantMetricSample>>
}
