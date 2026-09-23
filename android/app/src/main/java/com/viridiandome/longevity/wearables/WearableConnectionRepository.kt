package com.viridiandome.longevity.wearables

import com.viridiandome.longevity.wearables.network.WearableConnectionResponse

/** Product boundary for reading and registering the signed-in user's connections. */
interface WearableConnectionRepository {
    suspend fun getConnections(): WearableConnectionsResult

    suspend fun registerHealthConnect(): WearableConnectionRegistrationResult

    suspend fun getOrRegisterHealthConnect(): WearableConnectionResolutionResult

    suspend fun disconnect(connectionId: String): WearableConnectionDisconnectResult
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

/** Final outcome of reusing or registering the caller's Health Connect row. */
sealed interface WearableConnectionResolutionResult {
    data class Success(
        val connection: WearableConnectionResponse,
    ) : WearableConnectionResolutionResult

    data object Rejected : WearableConnectionResolutionResult

    data object NoSession : WearableConnectionResolutionResult

    data object Unavailable : WearableConnectionResolutionResult
}

/** Disconnect outcomes keep an expired session separate from a retryable failure. */
sealed interface WearableConnectionDisconnectResult {
    data object Success : WearableConnectionDisconnectResult

    data object NoSession : WearableConnectionDisconnectResult

    data object Unavailable : WearableConnectionDisconnectResult
}
