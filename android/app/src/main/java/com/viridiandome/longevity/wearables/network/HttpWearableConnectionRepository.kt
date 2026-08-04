package com.viridiandome.longevity.wearables.network

import com.viridiandome.longevity.auth.network.AuthenticatedApiClient
import com.viridiandome.longevity.auth.network.AuthenticatedApiResult
import com.viridiandome.longevity.wearables.WearableConnectionRepository
import com.viridiandome.longevity.wearables.WearableConnectionsResult
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request

/** Reads caller-owned connections through the shared JWT-aware API client. */
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

    private companion object {
        val SUCCESS_STATUS_RANGE = 200..299
    }
}
