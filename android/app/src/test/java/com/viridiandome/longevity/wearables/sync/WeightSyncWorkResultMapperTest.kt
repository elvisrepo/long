package com.viridiandome.longevity.wearables.sync

import androidx.work.ListenableWorker
import org.junit.Assert.assertEquals
import org.junit.Test

class WeightSyncWorkResultMapperTest {
    @Test
    fun completed_and_no_data_outcomes_are_successful_work() {
        assertEquals(
            ListenableWorker.Result.success(),
            WeightSyncResult.Completed(emptyList()).toWorkResult(),
        )
        assertEquals(
            ListenableWorker.Result.success(),
            WeightSyncResult.NoData.toWorkResult(),
        )
    }

    @Test
    fun temporary_read_and_transport_failures_are_retryable_work() {
        listOf(
            WeightSyncFailure.ReadUnavailable,
            WeightSyncFailure.Unavailable,
        ).forEach { failure ->
            val result = WeightSyncResult.Interrupted(
                completedReceipts = emptyList(),
                failure = failure,
            )

            assertEquals(
                ListenableWorker.Result.retry(),
                result.toWorkResult(),
            )
        }
    }

    @Test
    fun foreground_or_domain_repair_outcomes_are_failed_work() {
        listOf(
            WeightSyncFailure.PermissionRequired,
            WeightSyncFailure.Conflict,
            WeightSyncFailure.Rejected,
            WeightSyncFailure.NoSession,
        ).forEach { failure ->
            val result = WeightSyncResult.Interrupted(
                completedReceipts = emptyList(),
                failure = failure,
            )

            assertEquals(
                ListenableWorker.Result.failure(),
                result.toWorkResult(),
            )
        }
    }
}
