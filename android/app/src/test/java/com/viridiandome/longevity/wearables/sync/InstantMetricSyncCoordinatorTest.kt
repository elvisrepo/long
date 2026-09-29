package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectInstantMetric
import com.viridiandome.longevity.wearables.HealthConnectInstantMetricSample
import com.viridiandome.longevity.wearables.InstantMetricReadPermissionRequiredException
import com.viridiandome.longevity.wearables.InstantMetricUploadRepository
import com.viridiandome.longevity.wearables.WearableUploadReceipt
import com.viridiandome.longevity.wearables.WearableUploadResult
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class InstantMetricSyncCoordinatorTest {
    @Test
    fun uploads_each_planned_batch_and_returns_receipts() = runTest {
        val first = sample("first")
        val second = sample("second")
        val receipt = receipt("run-1")
        val repository = RecordingInstantMetricUploadRepository(
            results = mutableListOf(WearableUploadResult.Success(receipt)),
        )
        val coordinator = InstantMetricSyncCoordinator(
            planner = InstantMetricSyncBatchPlanner { listOf(listOf(first, second)) },
            uploadRepository = repository,
            uploadIdFactory = { "upload-1" },
        )

        val result = coordinator.sync(CONNECTION_ID)

        assertEquals(WeightSyncResult.Completed(listOf(receipt)), result)
        assertEquals(listOf(first, second), repository.uploadedSamples)
        assertEquals("upload-1", repository.uploadIds.single())
    }

    @Test
    fun permission_failure_is_reported_without_uploading() = runTest {
        val repository = RecordingInstantMetricUploadRepository()
        val expectedCause = SecurityException("denied")
        val coordinator = InstantMetricSyncCoordinator(
            planner = InstantMetricSyncBatchPlanner {
                throw InstantMetricReadPermissionRequiredException(expectedCause)
            },
            uploadRepository = repository,
        )

        val result = coordinator.sync(CONNECTION_ID)

        assertEquals(
            WeightSyncResult.Interrupted(
                completedReceipts = emptyList(),
                failure = WeightSyncFailure.PermissionRequired,
            ),
            result,
        )
        assertEquals(emptyList<HealthConnectInstantMetricSample>(), repository.uploadedSamples)
    }

    private fun sample(id: String): HealthConnectInstantMetricSample =
        HealthConnectInstantMetricSample(
            metric = HealthConnectInstantMetric.RESTING_HEART_RATE,
            recordId = id,
            value = 58.0,
            recordedAt = Instant.parse("2026-09-28T08:00:00Z"),
            sourcePackageName = "com.fitbit.FitbitMobile",
            sourceRecordModifiedAt = Instant.parse("2026-09-28T08:01:00Z"),
        )

    private fun receipt(id: String): WearableUploadReceipt = WearableUploadReceipt(
        id = id,
        connectionId = CONNECTION_ID,
        uploadId = "upload-1",
        status = "completed",
        receivedAt = Instant.parse("2026-09-28T08:02:00Z"),
        processingStartedAt = null,
        finishedAt = Instant.parse("2026-09-28T08:02:01Z"),
        entriesImported = 2,
        entriesSkipped = 0,
    )

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
    }
}

private class RecordingInstantMetricUploadRepository(
    private val results: MutableList<WearableUploadResult> = mutableListOf(),
) : InstantMetricUploadRepository {
    val uploadedSamples = mutableListOf<HealthConnectInstantMetricSample>()
    val uploadIds = mutableListOf<String>()

    override suspend fun uploadInstantMetricBatch(
        connectionId: String,
        uploadId: String,
        samples: List<HealthConnectInstantMetricSample>,
    ): WearableUploadResult {
        uploadIds += uploadId
        uploadedSamples += samples
        return results.removeFirst()
    }
}
