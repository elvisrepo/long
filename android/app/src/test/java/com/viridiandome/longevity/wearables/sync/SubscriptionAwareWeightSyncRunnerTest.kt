package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.subscriptions.SyncPolicy
import com.viridiandome.longevity.subscriptions.SyncPolicyRepository
import com.viridiandome.longevity.subscriptions.SyncPolicyResult
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SubscriptionAwareWeightSyncRunnerTest {
    @Test
    fun enabled_automatic_sync_delegates_to_incremental_sync() = runTest {
        var delegateCalled = false
        val expectedResult = WeightSyncResult.Completed(emptyList())
        val runner = SubscriptionAwareWeightSyncRunner(
            policyRepository = FixedSyncPolicyRepository(
                SyncPolicyResult.Success(
                    SyncPolicy(
                        automaticSyncEnabled = true,
                        syncIntervalMinutes = 15,
                    ),
                ),
            ),
            delegate = WeightSyncRunner {
                delegateCalled = true
                expectedResult
            },
        )

        val result = runner.sync(CONNECTION_ID)

        assertTrue(delegateCalled)
        assertEquals(expectedResult, result)
    }

    @Test
    fun disabled_automatic_sync_stops_before_device_data_is_read() = runTest {
        var delegateCalled = false
        val runner = SubscriptionAwareWeightSyncRunner(
            policyRepository = FixedSyncPolicyRepository(
                SyncPolicyResult.Success(
                    SyncPolicy(
                        automaticSyncEnabled = false,
                        syncIntervalMinutes = 30,
                    ),
                ),
            ),
            delegate = WeightSyncRunner {
                delegateCalled = true
                WeightSyncResult.NoData
            },
        )

        val result = runner.sync(CONNECTION_ID)

        assertFalse(delegateCalled)
        assertEquals(
            WeightSyncResult.Interrupted(
                completedReceipts = emptyList(),
                failure = WeightSyncFailure.AutomaticSyncDisabled,
            ),
            result,
        )
    }

    @Test
    fun unavailable_sync_policy_stops_before_reading_and_is_retryable() = runTest {
        var delegateCalled = false
        val runner = SubscriptionAwareWeightSyncRunner(
            policyRepository = FixedSyncPolicyRepository(
                SyncPolicyResult.Unavailable,
            ),
            delegate = WeightSyncRunner {
                delegateCalled = true
                WeightSyncResult.NoData
            },
        )

        val result = runner.sync(CONNECTION_ID)

        assertFalse(delegateCalled)
        assertEquals(
            WeightSyncResult.Interrupted(
                completedReceipts = emptyList(),
                failure = WeightSyncFailure.Unavailable,
            ),
            result,
        )
    }

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
    }
}

private class FixedSyncPolicyRepository(
    private val result: SyncPolicyResult,
) : SyncPolicyRepository {
    override suspend fun getCurrentSyncPolicy(): SyncPolicyResult = result
}
