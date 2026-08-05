package com.viridiandome.longevity.wearables

import java.time.Instant

/** Product boundary for uploading one retry-stable normalized weight batch. */
interface WearableUploadRepository {
    suspend fun uploadWeightBatch(
        connectionId: String,
        uploadId: String,
        samples: List<HealthConnectWeightSample>,
    ): WearableUploadResult
}

/** Device-neutral copy of Django's read-only SyncRun receipt. */
data class WearableUploadReceipt(
    val id: String,
    val connectionId: String,
    val uploadId: String,
    val status: String,
    val receivedAt: Instant,
    val processingStartedAt: Instant?,
    val finishedAt: Instant?,
    val entriesImported: Int,
    val entriesSkipped: Int,
)

/** Upload outcomes keep domain conflicts separate from retryable failures. */
sealed interface WearableUploadResult {
    data class Success(
        val receipt: WearableUploadReceipt,
    ) : WearableUploadResult

    data object Conflict : WearableUploadResult

    data object Rejected : WearableUploadResult

    data object NoSession : WearableUploadResult

    data object Unavailable : WearableUploadResult
}
