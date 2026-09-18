package com.viridiandome.longevity.wearables.sync

import android.content.Context
import androidx.work.ListenableWorker
import java.time.Instant
import kotlinx.coroutines.CancellationException

/** Local, identifier-free evidence of when WorkManager actually ran. */
data class AutomaticSyncAttempt(
    val startedAt: Instant,
    val outcome: AutomaticSyncOutcome?,
)

enum class AutomaticSyncOutcome {
    Success,
    Retry,
    Failure,
    Cancelled,
    Crashed,
}

/** Records the actual WorkManager execution boundary, without sync payloads. */
suspend fun runAutomaticSyncWithDiagnostics(
    diagnostics: AutomaticSyncDiagnostics,
    appVisible: Boolean,
    run: suspend () -> ListenableWorker.Result,
): ListenableWorker.Result {
    diagnostics.started(appVisible)
    return try {
        val result = run()
        val outcome = when (result) {
            is ListenableWorker.Result.Success -> AutomaticSyncOutcome.Success
            is ListenableWorker.Result.Retry -> AutomaticSyncOutcome.Retry
            else -> AutomaticSyncOutcome.Failure
        }
        diagnostics.finished(appVisible, outcome)
        result
    } catch (exception: CancellationException) {
        diagnostics.finished(appVisible, AutomaticSyncOutcome.Cancelled)
        throw exception
    } catch (exception: Exception) {
        diagnostics.finished(appVisible, AutomaticSyncOutcome.Crashed)
        throw exception
    }
}

interface DiagnosticStore {
    fun get(key: String): String?
    fun put(values: Map<String, String>)
}

class AutomaticSyncDiagnostics(
    private val store: DiagnosticStore,
    private val now: () -> Instant = Instant::now,
) {
    fun started(appVisible: Boolean) {
        val prefix = keyPrefix(appVisible)
        store.put(
            mapOf(
                "${prefix}_started_at" to now().toString(),
                "${prefix}_outcome" to "",
            ),
        )
    }

    fun finished(appVisible: Boolean, outcome: AutomaticSyncOutcome) {
        store.put(mapOf("${keyPrefix(appVisible)}_outcome" to outcome.name))
    }

    fun latestBackgroundAttempt(): AutomaticSyncAttempt? = latest("background")

    fun latestForegroundAttempt(): AutomaticSyncAttempt? = latest("foreground")

    private fun latest(prefix: String): AutomaticSyncAttempt? {
        val startedAt = store.get("${prefix}_started_at")
            ?.let { runCatching { Instant.parse(it) }.getOrNull() }
            ?: return null
        val outcome = store.get("${prefix}_outcome")
            ?.takeIf(String::isNotEmpty)
            ?.let { runCatching { AutomaticSyncOutcome.valueOf(it) }.getOrNull() }
        return AutomaticSyncAttempt(startedAt, outcome)
    }

    private fun keyPrefix(appVisible: Boolean): String =
        if (appVisible) "foreground" else "background"
}

class SharedPreferencesDiagnosticStore(context: Context) : DiagnosticStore {
    private val preferences = context.getSharedPreferences(
        "automatic_sync_diagnostics",
        Context.MODE_PRIVATE,
    )

    override fun get(key: String): String? = preferences.getString(key, null)

    override fun put(values: Map<String, String>) {
        val editor = preferences.edit()
        values.forEach { (key, value) -> editor.putString(key, value) }
        editor.commit()
    }
}
