package com.viridiandome.longevity.wearables.network

import com.viridiandome.longevity.auth.network.AuthenticatedApiClient
import com.viridiandome.longevity.auth.network.AuthenticatedApiResult
import com.viridiandome.longevity.wearables.HealthConnectStepsSample
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import com.viridiandome.longevity.wearables.WearableUploadReceipt
import com.viridiandome.longevity.wearables.WearableUploadRepository
import com.viridiandome.longevity.wearables.WearableUploadResult
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.Instant
import java.time.format.DateTimeParseException

/** Posts normalized weight batches through the shared JWT-aware API client. */
class HttpWearableUploadRepository(
    private val authenticatedApiClient: AuthenticatedApiClient,
    baseUrl: String,
    private val json: Json = Json,
) : WearableUploadRepository {
    private val uploadsUrl = baseUrl
        .toHttpUrl()
        .newBuilder()
        .addPathSegments("api/v1/wearables/uploads/")
        .build()

    override suspend fun uploadWeightBatch(
        connectionId: String,
        uploadId: String,
        samples: List<HealthConnectWeightSample>,
    ): WearableUploadResult = uploadEntries(
        connectionId = connectionId,
        uploadId = uploadId,
        entries = samples.map(WearableUploadEntryRequest::from),
    )

    override suspend fun uploadStepsBatch(
        connectionId: String,
        uploadId: String,
        samples: List<HealthConnectStepsSample>,
    ): WearableUploadResult = uploadEntries(
        connectionId = connectionId,
        uploadId = uploadId,
        entries = samples.map(WearableUploadEntryRequest::from),
    )

    private suspend fun uploadEntries(
        connectionId: String,
        uploadId: String,
        entries: List<WearableUploadEntryRequest>,
    ): WearableUploadResult {
        val requestBody = json.encodeToString(
            WearableUploadRequest(
                connectionId = connectionId,
                uploadId = uploadId,
                entries = entries,
            ),
        ).toRequestBody(JSON_MEDIA_TYPE)
        val result = authenticatedApiClient.execute(
            Request.Builder()
                .url(uploadsUrl)
                .post(requestBody)
                .build(),
        )

        return when (result) {
            AuthenticatedApiResult.NoSession -> WearableUploadResult.NoSession
            AuthenticatedApiResult.Unavailable -> WearableUploadResult.Unavailable
            is AuthenticatedApiResult.Response -> decodeResponse(result)
        }
    }

    private fun decodeResponse(
        response: AuthenticatedApiResult.Response,
    ): WearableUploadResult {
        if (response.statusCode !in SUCCESS_STATUS_CODES) {
            return when (response.statusCode) {
                HTTP_BAD_REQUEST, HTTP_NOT_FOUND -> WearableUploadResult.Rejected
                HTTP_CONFLICT -> WearableUploadResult.Conflict
                else -> WearableUploadResult.Unavailable
            }
        }

        return try {
            val syncRun = json.decodeFromString<SyncRunResponse>(response.body)
            WearableUploadResult.Success(syncRun.toReceipt())
        } catch (_: SerializationException) {
            WearableUploadResult.Unavailable
        } catch (_: DateTimeParseException) {
            WearableUploadResult.Unavailable
        }
    }

    private fun SyncRunResponse.toReceipt(): WearableUploadReceipt =
        WearableUploadReceipt(
            id = id,
            connectionId = connectionId,
            uploadId = uploadId,
            status = status,
            receivedAt = Instant.parse(receivedAt),
            processingStartedAt = processingStartedAt?.let(Instant::parse),
            finishedAt = finishedAt?.let(Instant::parse),
            entriesImported = entriesImported,
            entriesSkipped = entriesSkipped,
        )

    private companion object {
        val JSON_MEDIA_TYPE = "application/json".toMediaType()
        val SUCCESS_STATUS_CODES = setOf(200, 201)
        const val HTTP_BAD_REQUEST = 400
        const val HTTP_NOT_FOUND = 404
        const val HTTP_CONFLICT = 409
    }
}
