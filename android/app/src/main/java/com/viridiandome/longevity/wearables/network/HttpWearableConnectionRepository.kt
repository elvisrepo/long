package com.viridiandome.longevity.wearables.network

import com.viridiandome.longevity.auth.network.AuthenticatedApiClient
import com.viridiandome.longevity.auth.network.AuthenticatedApiResult
import com.viridiandome.longevity.wearables.WearableConnectionDisconnectResult
import com.viridiandome.longevity.wearables.WearableConnectionRegistrationResult
import com.viridiandome.longevity.wearables.WearableConnectionRepository
import com.viridiandome.longevity.wearables.WearableConnectionResolutionResult
import com.viridiandome.longevity.wearables.WearableConnectionsResult
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

private const val HEALTH_CONNECT_PROVIDER = "health_connect"

/** Reads and registers caller-owned connections through the JWT-aware API client. */
class HttpWearableConnectionRepository(
    private val authenticatedApiClient: AuthenticatedApiClient,
    baseUrl: String,
    private val json: Json = Json,
) : WearableConnectionRepository {
    private val connectionsUrl = baseUrl
        .toHttpUrl()
        .newBuilder()
        .addPathSegments("api/v1/wearables/connections/")
        .build()

    override suspend fun getConnections(): WearableConnectionsResult {
        val result = authenticatedApiClient.execute(
            Request.Builder()
                .url(connectionsUrl)
                .get()
                .build(),
        )

        return when (result) {
            AuthenticatedApiResult.NoSession ->
                WearableConnectionsResult.NoSession

            AuthenticatedApiResult.Unavailable ->
                WearableConnectionsResult.Unavailable

            is AuthenticatedApiResult.Response -> decodeResponse(result)
        }
    }

    override suspend fun registerHealthConnect():
        WearableConnectionRegistrationResult {
        val requestBody = json
            .encodeToString(
                WearableConnectionRegistrationRequest(
                    provider = HEALTH_CONNECT_PROVIDER,
                ),
            )
            .toRequestBody(JSON_MEDIA_TYPE)
        val result = authenticatedApiClient.execute(
            Request.Builder()
                .url(connectionsUrl)
                .post(requestBody)
                .build(),
        )

        return when (result) {
            AuthenticatedApiResult.NoSession ->
                WearableConnectionRegistrationResult.NoSession

            AuthenticatedApiResult.Unavailable ->
                WearableConnectionRegistrationResult.Unavailable

            is AuthenticatedApiResult.Response -> decodeRegistration(result)
        }
    }

    override suspend fun getOrRegisterHealthConnect():
        WearableConnectionResolutionResult =
        when (val connectionsResult = getConnections()) {
            is WearableConnectionsResult.Success -> {
                val existingConnection = connectionsResult.connections
                    .firstOrNull { it.provider == HEALTH_CONNECT_PROVIDER }

                if (existingConnection != null) {
                    WearableConnectionResolutionResult.Success(existingConnection)
                } else {
                    resolveRegistration(registerHealthConnect())
                }
            }

            WearableConnectionsResult.NoSession ->
                WearableConnectionResolutionResult.NoSession

            WearableConnectionsResult.Unavailable ->
                WearableConnectionResolutionResult.Unavailable
        }

    override suspend fun disconnect(
        connectionId: String,
    ): WearableConnectionDisconnectResult {
        require(connectionId.isNotBlank()) {
            "A wearable connection ID is required to disconnect."
        }
        val connectionUrl = connectionsUrl.newBuilder()
            .addPathSegment(connectionId)
            .addPathSegment("")
            .build()
        val result = authenticatedApiClient.execute(
            Request.Builder()
                .url(connectionUrl)
                .delete()
                .build(),
        )

        return when (result) {
            AuthenticatedApiResult.NoSession ->
                WearableConnectionDisconnectResult.NoSession

            AuthenticatedApiResult.Unavailable ->
                WearableConnectionDisconnectResult.Unavailable

            is AuthenticatedApiResult.Response ->
                if (
                    result.statusCode == HTTP_NO_CONTENT ||
                    result.statusCode == HTTP_NOT_FOUND
                ) {
                    // A stale/already-disconnected caller-owned row is already in
                    // the requested terminal state, so local cleanup can proceed.
                    WearableConnectionDisconnectResult.Success
                } else {
                    WearableConnectionDisconnectResult.Unavailable
                }
        }
    }

    private fun decodeResponse(
        response: AuthenticatedApiResult.Response,
    ): WearableConnectionsResult {
        if (response.statusCode !in SUCCESS_STATUS_RANGE) {
            return WearableConnectionsResult.Unavailable
        }

        return try {
            WearableConnectionsResult.Success(
                connections = json.decodeFromString<List<WearableConnectionResponse>>(
                    response.body,
                ),
            )
        } catch (_: SerializationException) {
            WearableConnectionsResult.Unavailable
        }
    }

    private fun decodeRegistration(
        response: AuthenticatedApiResult.Response,
    ): WearableConnectionRegistrationResult {
        if (response.statusCode == HTTP_BAD_REQUEST) {
            return WearableConnectionRegistrationResult.Rejected
        }
        if (response.statusCode !in SUCCESS_STATUS_RANGE) {
            return WearableConnectionRegistrationResult.Unavailable
        }

        return try {
            WearableConnectionRegistrationResult.Success(
                connection = json.decodeFromString<WearableConnectionResponse>(
                    response.body,
                ),
            )
        } catch (_: SerializationException) {
            WearableConnectionRegistrationResult.Unavailable
        }
    }

    private fun resolveRegistration(
        result: WearableConnectionRegistrationResult,
    ): WearableConnectionResolutionResult =
        when (result) {
            is WearableConnectionRegistrationResult.Success ->
                WearableConnectionResolutionResult.Success(result.connection)

            WearableConnectionRegistrationResult.Rejected ->
                WearableConnectionResolutionResult.Rejected

            WearableConnectionRegistrationResult.NoSession ->
                WearableConnectionResolutionResult.NoSession

            WearableConnectionRegistrationResult.Unavailable ->
                WearableConnectionResolutionResult.Unavailable
        }

    private companion object {
        val JSON_MEDIA_TYPE = "application/json".toMediaType()
        const val HTTP_BAD_REQUEST = 400
        const val HTTP_NOT_FOUND = 404
        const val HTTP_NO_CONTENT = 204
        val SUCCESS_STATUS_RANGE = 200..299
    }
}
