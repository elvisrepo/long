package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.HealthConnectWeightReader
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import com.viridiandome.longevity.wearables.WearableUploadReceipt
import com.viridiandome.longevity.wearables.WearableUploadRepository
import com.viridiandome.longevity.wearables.WearableUploadResult
import com.viridiandome.longevity.wearables.WeightReadPermissionRequiredException
import com.viridiandome.longevity.wearables.WeightReadUnavailableException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/** Proves orchestration independently from any one weight-selection policy. */
class WeightSyncCoordinatorTest {
    @Test
    fun coordinator_accepts_a_planner_boundary_without_health_connect() = runTest {
        val sample = weightSample("record-from-planner-boundary")
        var plannedConnectionId: String? = null
        val planner = WeightSyncBatchPlanner { connectionId ->
            plannedConnectionId = connectionId
            listOf(listOf(sample))
        }
        val receipt = successfulReceipt(UPLOAD_ID)
        val repository = RecordingUploadRepository(
            results = listOf(WearableUploadResult.Success(receipt)),
        )
        val coordinator = WeightSyncCoordinator(
            planner = planner,
            uploadRepository = repository,
            uploadIdFactory = { UPLOAD_ID },
        )

        val result = coordinator.sync(CONNECTION_ID)

        assertEquals(CONNECTION_ID, plannedConnectionId)
        assertEquals(
            listOf(UploadCall(CONNECTION_ID, UPLOAD_ID, listOf(sample))),
            repository.calls,
        )
        assertEquals(WeightSyncResult.Completed(listOf(receipt)), result)
    }

    @Test
    fun one_planned_batch_is_uploaded_with_one_generated_identity() = runTest {
        val sample = weightSample("record-123")
        val planner = InitialWeightSyncPlanner(
            reader = CoordinatorWeightReader(listOf(sample)),
            clock = fixedClock(),
        )
        val receipt = successfulReceipt(UPLOAD_ID)
        val repository = RecordingUploadRepository(
            results = listOf(WearableUploadResult.Success(receipt)),
        )
        val coordinator = WeightSyncCoordinator(
            planner = planner,
            uploadRepository = repository,
            uploadIdFactory = { UPLOAD_ID },
        )

        val result = coordinator.sync(CONNECTION_ID)

        assertEquals(
            listOf(UploadCall(CONNECTION_ID, UPLOAD_ID, listOf(sample))),
            repository.calls,
        )
        assertTrue(result is WeightSyncResult.Completed)
        result as WeightSyncResult.Completed
        assertEquals(listOf(receipt), result.receipts)
    }

    @Test
    fun no_samsung_samples_create_no_identity_and_no_upload() = runTest {
        val planner = InitialWeightSyncPlanner(
            reader = CoordinatorWeightReader(emptyList()),
            clock = fixedClock(),
        )
        val repository = RecordingUploadRepository(results = emptyList())
        var generatedIdentityCount = 0
        val coordinator = WeightSyncCoordinator(
            planner = planner,
            uploadRepository = repository,
            uploadIdFactory = {
                generatedIdentityCount += 1
                UPLOAD_ID
            },
        )

        val result = coordinator.sync(CONNECTION_ID)

        assertSame(WeightSyncResult.NoData, result)
        assertEquals(0, generatedIdentityCount)
        assertTrue(repository.calls.isEmpty())
    }

    @Test
    fun multiple_batches_receive_distinct_identities_and_upload_in_order() = runTest {
        val samples = (1..101).map { index -> weightSample("record-$index") }
        val planner = InitialWeightSyncPlanner(
            reader = CoordinatorWeightReader(samples),
            clock = fixedClock(),
        )
        val firstReceipt = successfulReceipt(UPLOAD_ID)
        val secondReceipt = successfulReceipt(SECOND_UPLOAD_ID)
        val repository = RecordingUploadRepository(
            results = listOf(
                WearableUploadResult.Success(firstReceipt),
                WearableUploadResult.Success(secondReceipt),
            ),
        )
        val uploadIds = listOf(UPLOAD_ID, SECOND_UPLOAD_ID).iterator()
        val coordinator = WeightSyncCoordinator(
            planner = planner,
            uploadRepository = repository,
            uploadIdFactory = uploadIds::next,
        )

        val result = coordinator.sync(CONNECTION_ID)

        assertEquals(listOf(100, 1), repository.calls.map { it.samples.size })
        assertEquals(
            listOf(UPLOAD_ID, SECOND_UPLOAD_ID),
            repository.calls.map { it.uploadId },
        )
        assertEquals("record-1", repository.calls.first().samples.first().recordId)
        assertEquals("record-101", repository.calls.last().samples.single().recordId)
        assertTrue(result is WeightSyncResult.Completed)
        result as WeightSyncResult.Completed
        assertEquals(listOf(firstReceipt, secondReceipt), result.receipts)
    }

    @Test
    fun later_failure_stops_uploading_and_preserves_completed_receipts() = runTest {
        val samples = (1..101).map { index -> weightSample("record-$index") }
        val planner = InitialWeightSyncPlanner(
            reader = CoordinatorWeightReader(samples),
            clock = fixedClock(),
        )
        val firstReceipt = successfulReceipt(UPLOAD_ID)
        val repository = RecordingUploadRepository(
            results = listOf(
                WearableUploadResult.Success(firstReceipt),
                WearableUploadResult.Unavailable,
            ),
        )
        val uploadIds = listOf(UPLOAD_ID, SECOND_UPLOAD_ID).iterator()
        val coordinator = WeightSyncCoordinator(
            planner = planner,
            uploadRepository = repository,
            uploadIdFactory = uploadIds::next,
        )

        val result = coordinator.sync(CONNECTION_ID)

        assertEquals(2, repository.calls.size)
        assertTrue(result is WeightSyncResult.Interrupted)
        result as WeightSyncResult.Interrupted
        assertEquals(listOf(firstReceipt), result.completedReceipts)
        assertEquals(WeightSyncFailure.Unavailable, result.failure)
    }

    @Test
    fun revoked_read_permission_stops_before_identity_or_upload() = runTest {
        val planner = InitialWeightSyncPlanner(
            reader = FailingCoordinatorWeightReader(
                WeightReadPermissionRequiredException(
                    SecurityException("permission revoked"),
                ),
            ),
            clock = fixedClock(),
        )
        val repository = RecordingUploadRepository(results = emptyList())
        var generatedIdentityCount = 0
        val coordinator = WeightSyncCoordinator(
            planner = planner,
            uploadRepository = repository,
            uploadIdFactory = {
                generatedIdentityCount += 1
                UPLOAD_ID
            },
        )

        val result = coordinator.sync(CONNECTION_ID)

        assertTrue(result is WeightSyncResult.Interrupted)
        result as WeightSyncResult.Interrupted
        assertTrue(result.completedReceipts.isEmpty())
        assertEquals(WeightSyncFailure.PermissionRequired, result.failure)
        assertEquals(0, generatedIdentityCount)
        assertTrue(repository.calls.isEmpty())
    }

    @Test
    fun health_connect_read_failure_stops_before_upload_as_retryable() = runTest {
        val planner = InitialWeightSyncPlanner(
            reader = FailingCoordinatorWeightReader(
                WeightReadUnavailableException(IOException("provider unavailable")),
            ),
            clock = fixedClock(),
        )
        val repository = RecordingUploadRepository(results = emptyList())
        val coordinator = WeightSyncCoordinator(
            planner = planner,
            uploadRepository = repository,
            uploadIdFactory = { error("A failed read must not generate an upload ID.") },
        )

        val result = coordinator.sync(CONNECTION_ID)

        assertTrue(result is WeightSyncResult.Interrupted)
        result as WeightSyncResult.Interrupted
        assertEquals(WeightSyncFailure.ReadUnavailable, result.failure)
        assertTrue(result.completedReceipts.isEmpty())
        assertTrue(repository.calls.isEmpty())
    }

    private fun weightSample(id: String): HealthConnectWeightSample =
        HealthConnectWeightSample(
            recordId = id,
            kilograms = 78.4,
            recordedAt = Instant.parse("2026-08-04T07:30:00Z"),
            sourcePackageName = "com.sec.android.app.shealth",
        )

    private fun fixedClock(): Clock = Clock.fixed(
        Instant.parse("2026-08-05T12:00:00Z"),
        ZoneOffset.UTC,
    )

    private fun successfulReceipt(uploadId: String): WearableUploadReceipt =
        WearableUploadReceipt(
            id = "6ac744c4-8202-4cd7-91c7-3d44ea067381",
            connectionId = CONNECTION_ID,
            uploadId = uploadId,
            status = "succeeded",
            receivedAt = Instant.parse("2026-08-05T12:00:01Z"),
            processingStartedAt = Instant.parse("2026-08-05T12:00:01Z"),
            finishedAt = Instant.parse("2026-08-05T12:00:02Z"),
            entriesImported = 1,
            entriesSkipped = 0,
        )

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
        const val UPLOAD_ID = "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34"
        const val SECOND_UPLOAD_ID = "10c0da1b-6922-46e6-80ab-091fdc5edc47"
    }
}

private class CoordinatorWeightReader(
    private val samples: List<HealthConnectWeightSample>,
) : HealthConnectWeightReader {
    override suspend fun readWeightSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectWeightSample> = samples
}

private class FailingCoordinatorWeightReader(
    private val failure: Exception,
) : HealthConnectWeightReader {
    override suspend fun readWeightSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectWeightSample> = throw failure
}

private data class UploadCall(
    val connectionId: String,
    val uploadId: String,
    val samples: List<HealthConnectWeightSample>,
)

private class RecordingUploadRepository(
    private val results: List<WearableUploadResult>,
) : WearableUploadRepository {
    val calls = mutableListOf<UploadCall>()
    private var resultIndex = 0

    override suspend fun uploadWeightBatch(
        connectionId: String,
        uploadId: String,
        samples: List<HealthConnectWeightSample>,
    ): WearableUploadResult {
        calls += UploadCall(connectionId, uploadId, samples)
        return results[resultIndex++]
    }
}
