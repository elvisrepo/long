package com.viridiandome.longevity.wearables

import com.viridiandome.longevity.wearables.network.WearableConnectionResponse

/** Product boundary for reading the signed-in user's wearable connections. */
interface WearableConnectionRepository {
    suspend fun getConnections(): WearableConnectionsResult

    suspend fun registerHealthConnect(): WearableConnectionRegistrationResult
}

/** Explicit outcomes keep missing authentication separate from temporary failure. */
sealed interface WearableConnectionsResult {
    data class Success(
        val connections: List<WearableConnectionResponse>,
    ) : WearableConnectionsResult

    data object NoSession : WearableConnectionsResult

    data object Unavailable : WearableConnectionsResult
}

/** Registration keeps domain rejection separate from auth and transport failures. */
sealed interface WearableConnectionRegistrationResult {
    data class Success(
        val connection: WearableConnectionResponse,
    ) : WearableConnectionRegistrationResult

    data object Rejected : WearableConnectionRegistrationResult

    data object NoSession : WearableConnectionRegistrationResult

    data object Unavailable : WearableConnectionRegistrationResult
}
