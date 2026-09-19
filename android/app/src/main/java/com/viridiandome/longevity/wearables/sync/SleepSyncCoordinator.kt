package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.SleepReadPermissionRequiredException
import com.viridiandome.longevity.wearables.SleepReadUnavailableException
import com.viridiandome.longevity.wearables.WearableUploadReceipt
import com.viridiandome.longevity.wearables.WearableUploadRepository
import com.viridiandome.longevity.wearables.WearableUploadResult
import java.util.UUID

/** Runs one planned sleep read-and-upload operation for a connection. */
class SleepSyncCoordinator(
    private val planner: SleepSyncBatchPlanner,
    private val uploadRepository: WearableUploadRepository,
    private val uploadIdFactory: () -> String = { UUID.randomUUID().toString() },
) : WeightSyncRunner {
    override suspend fun sync(connectionId: String): WeightSyncResult {
        val batches = try {
            planner.readBatches(connectionId)
        } catch (_: SleepReadPermissionRequiredException) {
            return interrupted(emptyList(), WeightSyncFailure.PermissionRequired)
        } catch (_: SleepReadUnavailableException) {
            return interrupted(emptyList(), WeightSyncFailure.ReadUnavailable)
        }
        if (batches.isEmpty()) return WeightSyncResult.NoData

        val receipts = mutableListOf<WearableUploadReceipt>()
        for (batch in batches) {
            when (val result = uploadRepository.uploadSleepBatch(
                connectionId,
                uploadIdFactory(),
                batch,
            )) {
                is WearableUploadResult.Success -> receipts += result.receipt
                WearableUploadResult.Conflict -> return interrupted(receipts, WeightSyncFailure.Conflict)
                WearableUploadResult.Rejected -> return interrupted(receipts, WeightSyncFailure.Rejected)
                WearableUploadResult.NoSession -> return interrupted(receipts, WeightSyncFailure.NoSession)
                WearableUploadResult.Unavailable -> return interrupted(receipts, WeightSyncFailure.Unavailable)
            }
        }
        return WeightSyncResult.Completed(receipts)
    }

    private fun interrupted(
        receipts: List<WearableUploadReceipt>,
        failure: WeightSyncFailure,
    ) = WeightSyncResult.Interrupted(receipts.toList(), failure)
}
