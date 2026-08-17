package com.viridiandome.longevity.subscriptions.network

import com.viridiandome.longevity.auth.network.AuthenticatedApiClient
import com.viridiandome.longevity.auth.network.AuthenticatedApiResult
import com.viridiandome.longevity.subscriptions.SyncPolicyRepository
import com.viridiandome.longevity.subscriptions.SyncPolicyResult
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request

/** Reads wearable sync entitlements from Django's current subscription. */
class HttpSyncPolicyRepository(
    private val authenticatedApiClient: AuthenticatedApiClient,
    baseUrl: String,
    private val json: Json = Json { ignoreUnknownKeys = true },
) : SyncPolicyRepository {
    private val currentSubscriptionUrl = baseUrl
        .toHttpUrl()
        .newBuilder()
        .addPathSegments("api/v1/subscriptions/current/")
        .build()

    override suspend fun getCurrentSyncPolicy(): SyncPolicyResult {
        val result = authenticatedApiClient.execute(
            Request.Builder()
                .url(currentSubscriptionUrl)
                .get()
                .build(),
        )

        return when (result) {
            AuthenticatedApiResult.NoSession -> SyncPolicyResult.NoSession
            AuthenticatedApiResult.Unavailable -> SyncPolicyResult.Unavailable
            is AuthenticatedApiResult.Response -> decodeResponse(result)
        }
    }

    private fun decodeResponse(
        response: AuthenticatedApiResult.Response,
    ): SyncPolicyResult {
        if (response.statusCode !in SUCCESS_STATUS_RANGE) {
            return SyncPolicyResult.Unavailable
        }

        return try {
            val decoded = json.decodeFromString<
                CurrentSubscriptionSyncPolicyResponse
            >(response.body)
            val policy = decoded.plan.toDomain()
                ?: return SyncPolicyResult.Unavailable
            SyncPolicyResult.Success(policy)
        } catch (_: SerializationException) {
            SyncPolicyResult.Unavailable
        }
    }

    private companion object {
        val SUCCESS_STATUS_RANGE = 200..299
    }
}
