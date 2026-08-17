package com.viridiandome.longevity.subscriptions

/** Server-owned wearable scheduling and manual-cooldown policy. */
data class SyncPolicy(
    val automaticSyncEnabled: Boolean,
    val syncIntervalMinutes: Long,
)

interface SyncPolicyRepository {
    suspend fun getCurrentSyncPolicy(): SyncPolicyResult
}

sealed interface SyncPolicyResult {
    data class Success(val policy: SyncPolicy) : SyncPolicyResult

    data object NoSession : SyncPolicyResult

    data object Unavailable : SyncPolicyResult
}
