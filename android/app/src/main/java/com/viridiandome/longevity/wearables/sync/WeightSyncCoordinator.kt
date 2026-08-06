package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.WearableUploadReceipt
import com.viridiandome.longevity.wearables.WearableUploadRepository
import com.viridiandome.longevity.wearables.WearableUploadResult
import com.viridiandome.longevity.wearables.WeightReadPermissionRequiredException
import com.viridiandome.longevity.wearables.WeightReadUnavailableException
import java.util.UUID

/** Runs one planned weight read-and-upload operation for a connection. */
class WeightSyncCoordinator(
    private val planner: WeightSyncBatchPlanner,
    private val uploadRepository: WearableUploadRepository,
    private val uploadIdFactory: () -> String = { UUID.randomUUID().toString() },
) : WeightSyncRunner {
    override suspend fun sync(connectionId: String): WeightSyncResult {
        val batches = try {
            planner.readBatches(connectionId)
        } catch (_: WeightReadPermissionRequiredException) {
            return interrupted(emptyList(), WeightSyncFailure.PermissionRequired)
        } catch (_: WeightReadUnavailableException) {
            return interrupted(emptyList(), WeightSyncFailure.ReadUnavailable)
        }
        if (batches.isEmpty()) {
            return WeightSyncResult.NoData
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
                    return interrupted(receipts, WeightSyncFailure.Conflict)

                WearableUploadResult.Rejected ->
                    return interrupted(receipts, WeightSyncFailure.Rejected)

                WearableUploadResult.NoSession ->
                    return interrupted(receipts, WeightSyncFailure.NoSession)

                WearableUploadResult.Unavailable ->
                    return interrupted(receipts, WeightSyncFailure.Unavailable)
            }
        }

        return WeightSyncResult.Completed(receipts.toList())
    }

    private fun interrupted(
        receipts: List<WearableUploadReceipt>,
        failure: WeightSyncFailure,
    ): WeightSyncResult.Interrupted =
        WeightSyncResult.Interrupted(
            completedReceipts = receipts.toList(),
            failure = failure,
        )
}

/** Shared caller boundary for explicit UI sync and future background work. */
fun interface WeightSyncRunner {
    suspend fun sync(connectionId: String): WeightSyncResult
}

sealed interface WeightSyncResult {
    data class Completed(
        val receipts: List<WearableUploadReceipt>,
    ) : WeightSyncResult

    data object NoData : WeightSyncResult

    data class Interrupted(
        val completedReceipts: List<WearableUploadReceipt>,
        val failure: WeightSyncFailure,
    ) : WeightSyncResult
}

sealed interface WeightSyncFailure {
    data object PermissionRequired : WeightSyncFailure

    data object ReadUnavailable : WeightSyncFailure

    data object Conflict : WeightSyncFailure

    data object Rejected : WeightSyncFailure

    data object NoSession : WeightSyncFailure

    data object Unavailable : WeightSyncFailure
}
