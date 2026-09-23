package com.viridiandome.longevity.wearables.sync

import androidx.work.ListenableWorker
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class AutomaticSyncWorkerRunTest {
    @Test
    fun worker_result_is_recorded_against_visibility_at_start() = runTest {
        val storage = WorkerRunDiagnosticStore()
        val diagnostics = AutomaticSyncDiagnostics(storage) {
            Instant.parse("2026-09-18T10:00:00Z")
        }

        val result = runAutomaticSyncWithDiagnostics(diagnostics, appVisible = false) {
            ListenableWorker.Result.retry()
        }

        assertEquals(ListenableWorker.Result.retry(), result)
        assertEquals(AutomaticSyncOutcome.Retry, diagnostics.latestBackgroundAttempt()?.outcome)
        assertEquals(null, diagnostics.latestForegroundAttempt())
    }
}

private class WorkerRunDiagnosticStore : DiagnosticStore {
    private val values = mutableMapOf<String, String>()

    override fun get(key: String): String? = values[key]

    override fun put(values: Map<String, String>) {
        this.values.putAll(values)
    }
}
