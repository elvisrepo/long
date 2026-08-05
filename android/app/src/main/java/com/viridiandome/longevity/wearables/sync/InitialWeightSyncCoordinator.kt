package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.WearableUploadReceipt
import com.viridiandome.longevity.wearables.WearableUploadRepository
import com.viridiandome.longevity.wearables.WearableUploadResult
import java.util.UUID

/** Runs one explicit initial read-and-upload operation for a connection. */
class InitialWeightSyncCoordinator(
    private val planner: InitialWeightSyncPlanner,
    private val uploadRepository: WearableUploadRepository,
    private val uploadIdFactory: () -> String = { UUID.randomUUID().toString() },
) {
    suspend fun sync(connectionId: String): InitialWeightSyncResult {
        val batches = planner.readBatches()
        if (batches.isEmpty()) {
            return InitialWeightSyncResult.NoData
        }

        val receipts = mutableListOf<WearableUploadReceipt>()
        for (batch in batches) {
            // Generate once for this attempt and pass the same identity with
            // this exact payload to the repository.
            val uploadId = uploadIdFactory()
            when (
                val result = uploadRepository.uploadWeightBatch(
                    connectionId = connectionId,
                    uploadId = uploadId,
                    samples = batch,
                )
            ) {
                is WearableUploadResult.Success -> receipts += result.receipt
                WearableUploadResult.Conflict ->
                    return interrupted(receipts, InitialWeightSyncFailure.Conflict)

                WearableUploadResult.Rejected ->
                    return interrupted(receipts, InitialWeightSyncFailure.Rejected)

                WearableUploadResult.NoSession ->
                    return interrupted(receipts, InitialWeightSyncFailure.NoSession)

                WearableUploadResult.Unavailable ->
                    return interrupted(receipts, InitialWeightSyncFailure.Unavailable)
            }
        }

        return InitialWeightSyncResult.Completed(receipts.toList())
    }

    private fun interrupted(
        receipts: List<WearableUploadReceipt>,
        failure: InitialWeightSyncFailure,
    ): InitialWeightSyncResult.Interrupted =
        InitialWeightSyncResult.Interrupted(
            completedReceipts = receipts.toList(),
            failure = failure,
        )
}

sealed interface InitialWeightSyncResult {
    data class Completed(
        val receipts: List<WearableUploadReceipt>,
    ) : InitialWeightSyncResult

    data object NoData : InitialWeightSyncResult

    data class Interrupted(
        val completedReceipts: List<WearableUploadReceipt>,
        val failure: InitialWeightSyncFailure,
    ) : InitialWeightSyncResult
}

sealed interface InitialWeightSyncFailure {
    data object Conflict : InitialWeightSyncFailure

    data object Rejected : InitialWeightSyncFailure

    data object NoSession : InitialWeightSyncFailure

    data object Unavailable : InitialWeightSyncFailure
}
