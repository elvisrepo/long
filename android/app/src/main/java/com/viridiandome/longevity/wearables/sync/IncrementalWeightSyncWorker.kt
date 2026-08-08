package com.viridiandome.longevity.wearables.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ListenableWorker
import androidx.work.WorkerParameters

/** WorkManager adapter for one incremental caller-owned connection sync. */
class IncrementalWeightSyncWorker internal constructor(
    appContext: Context,
    workerParameters: WorkerParameters,
    private val runner: WeightSyncRunner,
) : CoroutineWorker(appContext, workerParameters) {
    override suspend fun doWork(): ListenableWorker.Result {
        val connectionId = inputData.getString(CONNECTION_ID_INPUT)
        if (connectionId.isNullOrBlank()) {
            return ListenableWorker.Result.failure()
        }

        return runner.sync(connectionId).toWorkResult()
    }

    companion object {
        const val CONNECTION_ID_INPUT = "connection_id"
    }
}
