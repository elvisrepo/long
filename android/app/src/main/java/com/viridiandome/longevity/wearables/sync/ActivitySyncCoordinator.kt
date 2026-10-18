package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.ActivityMetricUploadRepository
import com.viridiandome.longevity.wearables.ActivityReadPermissionRequiredException
import com.viridiandome.longevity.wearables.ActivityReadUnavailableException
import com.viridiandome.longevity.wearables.HealthConnectActivityMetric
import com.viridiandome.longevity.wearables.HealthConnectActivityReader
import com.viridiandome.longevity.wearables.WearableUploadReceipt
import com.viridiandome.longevity.wearables.WearableUploadResult
import java.time.Clock
import java.time.Duration
import java.util.UUID

/** Uploads raw provenance and platform-prioritized activity snapshots together. */
class ActivitySyncCoordinator(
    private val reader: HealthConnectActivityReader,
    private val metric: HealthConnectActivityMetric,
    private val cursorStore: WeightSyncCursorStore,
    private val uploadRepository: ActivityMetricUploadRepository,
    private val clock: Clock = Clock.systemUTC(),
    private val uploadIdFactory: () -> String = { UUID.randomUUID().toString() },
) : WeightSyncRunner {
    override suspend fun sync(connectionId: String): WeightSyncResult {
        val endTime = clock.instant()
        val startTime = cursorStore.read(connectionId)?.minus(Duration.ofHours(24))
            ?: endTime.minus(Duration.ofDays(30))
        val samples = try {
            reader.readActivitySamples(metric, startTime, endTime)
        } catch (_: ActivityReadPermissionRequiredException) {
            return WeightSyncResult.Interrupted(emptyList(), WeightSyncFailure.PermissionRequired)
        } catch (_: ActivityReadUnavailableException) {
            return WeightSyncResult.Interrupted(emptyList(), WeightSyncFailure.ReadUnavailable)
        }
        if (samples.isEmpty()) return WeightSyncResult.NoData

        val receipts = mutableListOf<WearableUploadReceipt>()
        for (batch in samples.chunked(100)) {
            val result = uploadRepository.uploadActivityBatch(connectionId, uploadIdFactory(), batch)
            if (result is WearableUploadResult.Success) {
                receipts += result.receipt
                continue
            }
            val failure = when (result) {
                WearableUploadResult.Conflict -> WeightSyncFailure.Conflict
                WearableUploadResult.Rejected -> WeightSyncFailure.Rejected
                WearableUploadResult.NoSession -> WeightSyncFailure.NoSession
                WearableUploadResult.Unavailable -> WeightSyncFailure.Unavailable
                is WearableUploadResult.Success -> error("Handled above")
            }
            return WeightSyncResult.Interrupted(receipts.toList(), failure)
        }
        return WeightSyncResult.Completed(receipts.toList())
    }
}
