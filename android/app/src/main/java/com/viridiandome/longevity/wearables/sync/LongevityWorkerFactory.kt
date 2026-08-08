package com.viridiandome.longevity.wearables.sync

import android.content.Context
import androidx.work.ListenableWorker
import androidx.work.WorkerFactory
import androidx.work.WorkerParameters

/** Injects application-level domain dependencies into Longevity workers. */
class LongevityWorkerFactory(
    private val incrementalWeightSyncRunner: () -> WeightSyncRunner,
) : WorkerFactory() {
    override fun createWorker(
        appContext: Context,
        workerClassName: String,
        workerParameters: WorkerParameters,
    ): ListenableWorker? =
        when (workerClassName) {
            IncrementalWeightSyncWorker::class.java.name ->
                IncrementalWeightSyncWorker(
                    appContext = appContext,
                    workerParameters = workerParameters,
                    runner = incrementalWeightSyncRunner(),
                )

            else -> null
        }
}
