package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectStepsSample

/** Supplies ordered, backend-sized Steps batches for one sync window. */
fun interface StepsSyncBatchPlanner {
    suspend fun readBatches(
        connectionId: String,
    ): List<List<HealthConnectStepsSample>>
}
