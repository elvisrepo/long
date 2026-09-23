package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.WearableUploadReceipt

/** Runs every supported metric sync behind one UI and WorkManager boundary. */
class AllMetricsSyncRunner(
    private val runners: List<WeightSyncRunner>,
) : WeightSyncRunner {
    override suspend fun sync(connectionId: String): WeightSyncResult {
        val completedReceipts = mutableListOf<WearableUploadReceipt>()

        for (runner in runners) {
            when (val result = runner.sync(connectionId)) {
                is WeightSyncResult.Completed ->
                    completedReceipts += result.receipts

                WeightSyncResult.NoData -> Unit

                is WeightSyncResult.Interrupted ->
                    return WeightSyncResult.Interrupted(
                        completedReceipts = (
                            completedReceipts + result.completedReceipts
                        ),
                        failure = result.failure,
                    )
            }
        }

        return if (completedReceipts.isEmpty()) {
            WeightSyncResult.NoData
        } else {
            WeightSyncResult.Completed(completedReceipts.toList())
        }
    }
}
