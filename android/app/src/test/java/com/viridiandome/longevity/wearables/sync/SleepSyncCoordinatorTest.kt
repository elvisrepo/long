package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectSleepSample
import com.viridiandome.longevity.wearables.HealthConnectStepsSample
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import com.viridiandome.longevity.wearables.WearableUploadReceipt
import com.viridiandome.longevity.wearables.WearableUploadRepository
import com.viridiandome.longevity.wearables.WearableUploadResult
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class SleepSyncCoordinatorTest {
    @Test
    fun planned_sleep_session_is_uploaded() = runTest {
        val sample = HealthConnectSleepSample(
            "sleep-123",
            Instant.parse("2026-09-18T21:30:00Z"),
            Instant.parse("2026-09-19T05:30:00Z"),
            emptyList(),
            "com.sec.android.app.shealth",
            Instant.parse("2026-09-19T05:31:00Z"),
        )
        val receipt = WearableUploadReceipt(
            "receipt", CONNECTION_ID, UPLOAD_ID, "succeeded",
            Instant.parse("2026-09-19T05:32:00Z"), null, null, 1, 0,
        )
        val repository = RecordingSleepUploadRepository(
            WearableUploadResult.Success(receipt),
        )
        val coordinator = SleepSyncCoordinator(
            planner = SleepSyncBatchPlanner { listOf(listOf(sample)) },
            uploadRepository = repository,
            uploadIdFactory = { UPLOAD_ID },
        )

        val result = coordinator.sync(CONNECTION_ID)

        assertEquals(listOf(sample), repository.samples)
        assertEquals(WeightSyncResult.Completed(listOf(receipt)), result)
    }

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
        const val UPLOAD_ID = "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34"
    }
}

private class RecordingSleepUploadRepository(
    private val result: WearableUploadResult,
) : WearableUploadRepository {
    var samples: List<HealthConnectSleepSample> = emptyList()
    override suspend fun uploadWeightBatch(connectionId: String, uploadId: String, samples: List<HealthConnectWeightSample>) = error("unexpected")
    override suspend fun uploadStepsBatch(connectionId: String, uploadId: String, samples: List<HealthConnectStepsSample>) = error("unexpected")
    override suspend fun uploadSleepBatch(connectionId: String, uploadId: String, samples: List<HealthConnectSleepSample>): WearableUploadResult {
        this.samples = samples
        return result
    }
}
