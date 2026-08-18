package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.WearableUploadReceipt
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class AllMetricsSyncRunnerTest {
    @Test
    fun weight_and_steps_receipts_are_combined_in_runner_order() = runTest {
        val weightReceipt = receipt("weight-upload")
        val stepsReceipt = receipt("steps-upload")
        val calls = mutableListOf<String>()
        val runner = AllMetricsSyncRunner(
            runners = listOf(
                RecordingMetricRunner(
                    name = "weight",
                    calls = calls,
                    result = WeightSyncResult.Completed(listOf(weightReceipt)),
                ),
                RecordingMetricRunner(
                    name = "steps",
                    calls = calls,
                    result = WeightSyncResult.Completed(listOf(stepsReceipt)),
                ),
            ),
        )

        val result = runner.sync(CONNECTION_ID)

        assertEquals(listOf("weight", "steps"), calls)
        assertEquals(
            WeightSyncResult.Completed(listOf(weightReceipt, stepsReceipt)),
            result,
        )
    }

    @Test
    fun later_metric_failure_preserves_earlier_receipts_and_stops_the_run() = runTest {
        val weightReceipt = receipt("weight-upload")
        val calls = mutableListOf<String>()
        val runner = AllMetricsSyncRunner(
            runners = listOf(
                RecordingMetricRunner(
                    name = "weight",
                    calls = calls,
                    result = WeightSyncResult.Completed(listOf(weightReceipt)),
                ),
                RecordingMetricRunner(
                    name = "steps",
                    calls = calls,
                    result = WeightSyncResult.Interrupted(
                        completedReceipts = emptyList(),
                        failure = WeightSyncFailure.ReadUnavailable,
                    ),
                ),
                RecordingMetricRunner(
                    name = "future-metric",
                    calls = calls,
                    result = WeightSyncResult.NoData,
                ),
            ),
        )

        val result = runner.sync(CONNECTION_ID)

        assertEquals(listOf("weight", "steps"), calls)
        assertEquals(
            WeightSyncResult.Interrupted(
                completedReceipts = listOf(weightReceipt),
                failure = WeightSyncFailure.ReadUnavailable,
            ),
            result,
        )
    }

    private fun receipt(uploadId: String): WearableUploadReceipt =
        WearableUploadReceipt(
            id = uploadId,
            connectionId = CONNECTION_ID,
            uploadId = uploadId,
            status = "succeeded",
            receivedAt = Instant.parse("2026-08-05T08:00:01Z"),
            processingStartedAt = Instant.parse("2026-08-05T08:00:01Z"),
            finishedAt = Instant.parse("2026-08-05T08:00:02Z"),
            entriesImported = 1,
            entriesSkipped = 0,
        )

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
    }
}

private class RecordingMetricRunner(
    private val name: String,
    private val calls: MutableList<String>,
    private val result: WeightSyncResult,
) : WeightSyncRunner {
    override suspend fun sync(connectionId: String): WeightSyncResult {
        calls += name
        return result
    }
}
