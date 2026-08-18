package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.StepsReadPermissionRequiredException
import com.viridiandome.longevity.wearables.StepsReadUnavailableException
import com.viridiandome.longevity.wearables.WearableUploadReceipt
import com.viridiandome.longevity.wearables.WearableUploadRepository
import com.viridiandome.longevity.wearables.WearableUploadResult
import java.util.UUID

/** Runs one planned Steps read-and-upload operation for a connection. */
class StepsSyncCoordinator(
    private val planner: StepsSyncBatchPlanner,
    private val uploadRepository: WearableUploadRepository,
    private val uploadIdFactory: () -> String = { UUID.randomUUID().toString() },
) : WeightSyncRunner {
    override suspend fun sync(connectionId: String): WeightSyncResult {
        val batches = try {
            planner.readBatches(connectionId)
        } catch (_: StepsReadPermissionRequiredException) {
            return interrupted(emptyList(), WeightSyncFailure.PermissionRequired)
        } catch (_: StepsReadUnavailableException) {
            return interrupted(emptyList(), WeightSyncFailure.ReadUnavailable)
        }
        if (batches.isEmpty()) {
            return WeightSyncResult.NoData
        }

        val receipts = mutableListOf<WearableUploadReceipt>()
        for (batch in batches) {
            val uploadId = uploadIdFactory()
            when (
                val result = uploadRepository.uploadStepsBatch(
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
