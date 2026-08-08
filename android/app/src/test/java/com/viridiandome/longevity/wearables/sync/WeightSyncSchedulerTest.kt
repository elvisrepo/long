package com.viridiandome.longevity.wearables.sync

import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequest
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WeightSyncSchedulerTest {
    @Test
    fun periodic_request_contains_connection_network_and_interval_contract() {
        val request = buildIncrementalWeightSyncWorkRequest(CONNECTION_ID)

        assertEquals(
            CONNECTION_ID,
            request.workSpec.input.getString(
                IncrementalWeightSyncWorker.CONNECTION_ID_INPUT,
            ),
        )
        assertEquals(
            NetworkType.CONNECTED,
            request.workSpec.constraints.requiredNetworkType,
        )
        assertEquals(
            TimeUnit.MINUTES.toMillis(15),
            request.workSpec.intervalDuration,
        )
        assertTrue(WEIGHT_SYNC_WORK_TAG in request.tags)
    }

    @Test
    fun schedule_enqueues_unique_update_work_for_connection() {
        var enqueuedName: String? = null
        var enqueuedPolicy: ExistingPeriodicWorkPolicy? = null
        var enqueuedRequest: PeriodicWorkRequest? = null
        val scheduler = WorkManagerWeightSyncScheduler(
            enqueueUniquePeriodicWork = { name, policy, request ->
                enqueuedName = name
                enqueuedPolicy = policy
                enqueuedRequest = request
            },
            cancelAllWorkByTag = {},
        )

        scheduler.schedule(CONNECTION_ID)

        assertEquals(
            "$WEIGHT_SYNC_WORK_TAG:$CONNECTION_ID",
            enqueuedName,
        )
        assertEquals(ExistingPeriodicWorkPolicy.UPDATE, enqueuedPolicy)
        assertEquals(
            CONNECTION_ID,
            enqueuedRequest?.workSpec?.input?.getString(
                IncrementalWeightSyncWorker.CONNECTION_ID_INPUT,
            ),
        )
    }

    @Test
    fun cancel_all_cancels_every_weight_sync_work_by_stable_tag() {
        var cancelledTag: String? = null
        val scheduler = WorkManagerWeightSyncScheduler(
            enqueueUniquePeriodicWork = { _, _, _ -> },
            cancelAllWorkByTag = { tag -> cancelledTag = tag },
        )

        scheduler.cancelAll()

        assertEquals(WEIGHT_SYNC_WORK_TAG, cancelledTag)
    }

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
    }
}
