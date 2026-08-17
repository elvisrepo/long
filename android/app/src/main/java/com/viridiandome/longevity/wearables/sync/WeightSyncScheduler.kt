package com.viridiandome.longevity.wearables.sync

import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequest
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

internal const val WEIGHT_SYNC_WORK_TAG = "health_connect_weight_sync"

/** Device-side boundary for starting and stopping durable background weight sync. */
interface WeightSyncScheduler {
    fun schedule(
        connectionId: String,
        repeatIntervalMinutes: Long,
    )

    fun cancelAll()
}

/**
 * Registers one uniquely named periodic worker per wearable connection.
 *
 * UPDATE preserves the existing worker's history and next-run timing while applying
 * our latest constraints and input instead of creating duplicate periodic workers.
 */
class WorkManagerWeightSyncScheduler internal constructor(
    private val enqueueUniquePeriodicWork: (
        String,
        ExistingPeriodicWorkPolicy,
        PeriodicWorkRequest,
    ) -> Unit,
    private val cancelAllWorkByTag: (String) -> Unit,
) : WeightSyncScheduler {
    constructor(workManager: WorkManager) : this(
        enqueueUniquePeriodicWork = workManager::enqueueUniquePeriodicWork,
        cancelAllWorkByTag = workManager::cancelAllWorkByTag,
    )

    override fun schedule(
        connectionId: String,
        repeatIntervalMinutes: Long,
    ) {
        require(connectionId.isNotBlank()) {
            "A wearable connection ID is required to schedule weight sync."
        }
        require(repeatIntervalMinutes >= MINIMUM_PERIODIC_INTERVAL_MINUTES) {
            "Periodic weight sync cannot run more often than every 15 minutes."
        }

        enqueueUniquePeriodicWork(
            uniqueWeightSyncWorkName(connectionId),
            ExistingPeriodicWorkPolicy.UPDATE,
            buildIncrementalWeightSyncWorkRequest(
                connectionId = connectionId,
                repeatIntervalMinutes = repeatIntervalMinutes,
            ),
        )
    }

    override fun cancelAll() {
        cancelAllWorkByTag(WEIGHT_SYNC_WORK_TAG)
    }
}

internal fun uniqueWeightSyncWorkName(connectionId: String): String =
    "$WEIGHT_SYNC_WORK_TAG:$connectionId"

/** Builds the durable device-side contract for one connection's periodic sync. */
internal fun buildIncrementalWeightSyncWorkRequest(
    connectionId: String,
    repeatIntervalMinutes: Long,
): PeriodicWorkRequest =
    PeriodicWorkRequestBuilder<IncrementalWeightSyncWorker>(
        repeatInterval = repeatIntervalMinutes,
        repeatIntervalTimeUnit = TimeUnit.MINUTES,
    )
        .setConstraints(
            Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build(),
        )
        .setInputData(
            workDataOf(
                IncrementalWeightSyncWorker.CONNECTION_ID_INPUT to connectionId,
            ),
        )
        .addTag(WEIGHT_SYNC_WORK_TAG)
        .build()

private const val MINIMUM_PERIODIC_INTERVAL_MINUTES = 15L
