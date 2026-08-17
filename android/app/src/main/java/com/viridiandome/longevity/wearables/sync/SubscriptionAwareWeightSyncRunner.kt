package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.subscriptions.SyncPolicyRepository
import com.viridiandome.longevity.subscriptions.SyncPolicyResult

/** Rechecks paid automatic-sync entitlement before background device access. */
class SubscriptionAwareWeightSyncRunner(
    private val policyRepository: SyncPolicyRepository,
    private val delegate: WeightSyncRunner,
) : WeightSyncRunner {
    override suspend fun sync(connectionId: String): WeightSyncResult =
        when (val result = policyRepository.getCurrentSyncPolicy()) {
            is SyncPolicyResult.Success ->
                if (result.policy.automaticSyncEnabled) {
                    delegate.sync(connectionId)
                } else {
                    interrupted(WeightSyncFailure.AutomaticSyncDisabled)
                }

            SyncPolicyResult.NoSession ->
                interrupted(WeightSyncFailure.NoSession)

            SyncPolicyResult.Unavailable ->
                interrupted(WeightSyncFailure.Unavailable)
        }

    private fun interrupted(failure: WeightSyncFailure) =
        WeightSyncResult.Interrupted(
            completedReceipts = emptyList(),
            failure = failure,
        )
}
