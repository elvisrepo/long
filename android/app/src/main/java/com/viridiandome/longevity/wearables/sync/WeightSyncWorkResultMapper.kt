package com.viridiandome.longevity.wearables.sync

import androidx.work.ListenableWorker

/** Converts sync-domain outcomes into WorkManager scheduling decisions. */
internal fun WeightSyncResult.toWorkResult(): ListenableWorker.Result =
    when (this) {
        is WeightSyncResult.Completed,
        WeightSyncResult.NoData,
        -> ListenableWorker.Result.success()

        is WeightSyncResult.Interrupted ->
            when (failure) {
                WeightSyncFailure.ReadUnavailable,
                WeightSyncFailure.Unavailable,
                -> ListenableWorker.Result.retry()

                WeightSyncFailure.PermissionRequired,
                WeightSyncFailure.Conflict,
                WeightSyncFailure.Rejected,
                WeightSyncFailure.NoSession,
                -> ListenableWorker.Result.failure()
            }
    }
