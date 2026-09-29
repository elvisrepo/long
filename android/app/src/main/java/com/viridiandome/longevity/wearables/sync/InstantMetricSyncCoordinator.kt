package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.InstantMetricReadPermissionRequiredException
import com.viridiandome.longevity.wearables.InstantMetricReadUnavailableException
import com.viridiandome.longevity.wearables.InstantMetricUploadRepository
import com.viridiandome.longevity.wearables.WearableUploadReceipt
import com.viridiandome.longevity.wearables.WearableUploadResult
import java.util.UUID

/** Runs one planned cardiovascular read-and-upload operation. */
class InstantMetricSyncCoordinator(
    private val planner: InstantMetricSyncBatchPlanner,
    private val uploadRepository: InstantMetricUploadRepository,
    private val uploadIdFactory: () -> String = { UUID.randomUUID().toString() },
) : WeightSyncRunner {
    override suspend fun sync(connectionId: String): WeightSyncResult {
        val batches = try {
            planner.readBatches(connectionId)
        } catch (_: InstantMetricReadPermissionRequiredException) {
            return interrupted(emptyList(), WeightSyncFailure.PermissionRequired)
        } catch (_: InstantMetricReadUnavailableException) {
            return interrupted(emptyList(), WeightSyncFailure.ReadUnavailable)
        }
        if (batches.isEmpty()) {
            return WeightSyncResult.NoData
        }

        val receipts = mutableListOf<WearableUploadReceipt>()
        for (batch in batches) {
            when (
                val result = uploadRepository.uploadInstantMetricBatch(
                    connectionId = connectionId,
                    uploadId = uploadIdFactory(),
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
    ): WeightSyncResult.Interrupted = WeightSyncResult.Interrupted(
        completedReceipts = receipts.toList(),
        failure = failure,
    )
}
