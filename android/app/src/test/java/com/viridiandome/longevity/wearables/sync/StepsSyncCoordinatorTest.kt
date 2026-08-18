package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectStepsSample
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import com.viridiandome.longevity.wearables.StepsReadPermissionRequiredException
import com.viridiandome.longevity.wearables.WearableUploadReceipt
import com.viridiandome.longevity.wearables.WearableUploadRepository
import com.viridiandome.longevity.wearables.WearableUploadResult
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class StepsSyncCoordinatorTest {
    @Test
    fun planned_steps_batch_is_uploaded_with_one_generated_identity() = runTest {
        val sample = HealthConnectStepsSample(
            recordId = "steps-record-123",
            count = 420,
            periodStart = Instant.parse("2026-08-05T07:45:00Z"),
            periodEnd = Instant.parse("2026-08-05T08:00:00Z"),
            sourcePackageName = "com.sec.android.app.shealth",
            sourceRecordModifiedAt = Instant.parse("2026-08-05T08:01:00Z"),
        )
        val planner = StepsSyncBatchPlanner { listOf(listOf(sample)) }
        val receipt = successfulStepsReceipt()
        val repository = RecordingStepsUploadRepository(
            result = WearableUploadResult.Success(receipt),
        )
        val coordinator = StepsSyncCoordinator(
            planner = planner,
            uploadRepository = repository,
            uploadIdFactory = { UPLOAD_ID },
        )

        val result = coordinator.sync(CONNECTION_ID)

        assertEquals(
            listOf(StepsUploadCall(CONNECTION_ID, UPLOAD_ID, listOf(sample))),
            repository.calls,
        )
        assertEquals(WeightSyncResult.Completed(listOf(receipt)), result)
    }

    @Test
    fun revoked_steps_permission_stops_before_upload() = runTest {
        val planner = StepsSyncBatchPlanner {
            throw StepsReadPermissionRequiredException(
                SecurityException("permission revoked"),
            )
        }
        val repository = RecordingStepsUploadRepository(
            result = WearableUploadResult.Unavailable,
        )
        val coordinator = StepsSyncCoordinator(
            planner = planner,
            uploadRepository = repository,
            uploadIdFactory = {
                error("A failed read must not create an upload identity.")
            },
        )

        val result = coordinator.sync(CONNECTION_ID)

        assertTrue(result is WeightSyncResult.Interrupted)
        result as WeightSyncResult.Interrupted
        assertEquals(WeightSyncFailure.PermissionRequired, result.failure)
        assertTrue(repository.calls.isEmpty())
    }

    private fun successfulStepsReceipt(): WearableUploadReceipt =
        WearableUploadReceipt(
            id = "6ac744c4-8202-4cd7-91c7-3d44ea067381",
            connectionId = CONNECTION_ID,
            uploadId = UPLOAD_ID,
            status = "succeeded",
            receivedAt = Instant.parse("2026-08-05T08:00:01Z"),
            processingStartedAt = Instant.parse("2026-08-05T08:00:01Z"),
            finishedAt = Instant.parse("2026-08-05T08:00:02Z"),
            entriesImported = 1,
            entriesSkipped = 0,
        )

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
        const val UPLOAD_ID = "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34"
    }
}

private data class StepsUploadCall(
    val connectionId: String,
    val uploadId: String,
    val samples: List<HealthConnectStepsSample>,
)

private class RecordingStepsUploadRepository(
    private val result: WearableUploadResult,
) : WearableUploadRepository {
    val calls = mutableListOf<StepsUploadCall>()

    override suspend fun uploadWeightBatch(
        connectionId: String,
        uploadId: String,
        samples: List<HealthConnectWeightSample>,
    ): WearableUploadResult = error(
        "A StepsSyncCoordinator must not upload Weight samples.",
    )

    override suspend fun uploadStepsBatch(
        connectionId: String,
        uploadId: String,
        samples: List<HealthConnectStepsSample>,
    ): WearableUploadResult {
        calls += StepsUploadCall(connectionId, uploadId, samples)
        return result
    }
}
