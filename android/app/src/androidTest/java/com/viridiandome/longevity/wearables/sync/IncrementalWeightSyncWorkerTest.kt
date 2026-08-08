package com.viridiandome.longevity.wearables.sync

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ListenableWorker
import androidx.work.workDataOf
import androidx.work.testing.TestListenableWorkerBuilder
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class IncrementalWeightSyncWorkerTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Test
    fun worker_passes_connection_id_to_injected_runner_and_returns_its_mapping() = runTest {
        val runner = RecordingWorkerWeightSyncRunner(
            result = WeightSyncResult.Completed(emptyList()),
        )
        val worker = TestListenableWorkerBuilder<IncrementalWeightSyncWorker>(context)
            .setInputData(
                workDataOf(
                    IncrementalWeightSyncWorker.CONNECTION_ID_INPUT to CONNECTION_ID,
                ),
            )
            .setWorkerFactory(
                LongevityWorkerFactory(
                    incrementalWeightSyncRunner = { runner },
                ),
            )
            .build()

        val result = worker.doWork()

        assertEquals(listOf(CONNECTION_ID), runner.connectionIds)
        assertEquals(ListenableWorker.Result.success(), result)
    }

    @Test
    fun missing_connection_id_fails_without_calling_the_runner() = runTest {
        val runner = RecordingWorkerWeightSyncRunner(
            result = WeightSyncResult.Completed(emptyList()),
        )
        val worker = TestListenableWorkerBuilder<IncrementalWeightSyncWorker>(context)
            .setWorkerFactory(
                LongevityWorkerFactory(
                    incrementalWeightSyncRunner = { runner },
                ),
            )
            .build()

        val result = worker.doWork()

        assertEquals(emptyList<String>(), runner.connectionIds)
        assertEquals(ListenableWorker.Result.failure(), result)
    }

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
    }
}

private class RecordingWorkerWeightSyncRunner(
    private val result: WeightSyncResult,
) : WeightSyncRunner {
    val connectionIds = mutableListOf<String>()

    override suspend fun sync(connectionId: String): WeightSyncResult {
        connectionIds += connectionId
        return result
    }
}
