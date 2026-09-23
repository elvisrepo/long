package com.viridiandome.longevity.subscriptions.network

import com.viridiandome.longevity.subscriptions.SyncPolicy
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Minimal projection of the current-subscription response used by Android. */
@Serializable
internal data class CurrentSubscriptionSyncPolicyResponse(
    val plan: SubscriptionSyncPolicyResponse,
)

/** Server-owned wearable cadence nested beneath the current plan. */
@Serializable
internal data class SubscriptionSyncPolicyResponse(
    @SerialName("automatic_sync_enabled")
    val automaticSyncEnabled: Boolean,
    @SerialName("sync_interval_minutes")
    val syncIntervalMinutes: Long,
) {
    fun toDomain(): SyncPolicy? =
        if (
            syncIntervalMinutes > 0 &&
            (
                !automaticSyncEnabled ||
                    syncIntervalMinutes >= MINIMUM_AUTO_SYNC_INTERVAL_MINUTES
            )
        ) {
            SyncPolicy(
                automaticSyncEnabled = automaticSyncEnabled,
                syncIntervalMinutes = syncIntervalMinutes,
            )
        } else {
            null
        }

    private companion object {
        const val MINIMUM_AUTO_SYNC_INTERVAL_MINUTES = 15L
    }
}
