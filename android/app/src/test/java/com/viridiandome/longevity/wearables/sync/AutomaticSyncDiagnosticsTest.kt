package com.viridiandome.longevity.wearables.sync

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

class AutomaticSyncDiagnosticsTest {
    @Test
    fun foreground_attempt_does_not_replace_prior_background_attempt() {
        val storage = MemoryDiagnosticStore()
        var now = Instant.parse("2026-09-18T10:00:00Z")
        val diagnostics = AutomaticSyncDiagnostics(storage) { now }

        diagnostics.started(appVisible = false)
        diagnostics.finished(appVisible = false, outcome = AutomaticSyncOutcome.Retry)
        now = Instant.parse("2026-09-18T10:30:00Z")
        diagnostics.started(appVisible = true)
        diagnostics.finished(appVisible = true, outcome = AutomaticSyncOutcome.Success)

        assertEquals(
            AutomaticSyncAttempt(Instant.parse("2026-09-18T10:00:00Z"), AutomaticSyncOutcome.Retry),
            diagnostics.latestBackgroundAttempt(),
        )
        assertEquals(
            AutomaticSyncAttempt(Instant.parse("2026-09-18T10:30:00Z"), AutomaticSyncOutcome.Success),
            diagnostics.latestForegroundAttempt(),
        )
    }

    @Test
    fun started_attempt_remains_visible_if_worker_never_finishes() {
        val diagnostics = AutomaticSyncDiagnostics(MemoryDiagnosticStore()) {
            Instant.parse("2026-09-18T10:00:00Z")
        }

        diagnostics.started(appVisible = false)

        assertEquals(Instant.parse("2026-09-18T10:00:00Z"), diagnostics.latestBackgroundAttempt()?.startedAt)
        assertNull(diagnostics.latestBackgroundAttempt()?.outcome)
        assertNull(diagnostics.latestForegroundAttempt())
    }
}

private class MemoryDiagnosticStore : DiagnosticStore {
    private val values = mutableMapOf<String, String>()

    override fun get(key: String): String? = values[key]

    override fun put(values: Map<String, String>) {
        this.values.putAll(values)
    }
}
