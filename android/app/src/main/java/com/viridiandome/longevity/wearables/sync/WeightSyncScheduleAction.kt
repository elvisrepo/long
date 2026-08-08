package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.BackgroundReadAccess
import com.viridiandome.longevity.wearables.WearableConnectionUiState

/** One durable-work change that the Activity may apply to WorkManager. */
internal sealed interface WeightSyncScheduleAction {
    data class Schedule(val connectionId: String) : WeightSyncScheduleAction

    data object CancelAll : WeightSyncScheduleAction

    data object None : WeightSyncScheduleAction
}

/**
 * Decides scheduling from already-resolved application state.
 *
 * Startup session checking deliberately does nothing: WorkManager survives process
 * restarts, so transient unauthenticated state must not erase valid scheduled work.
 */
internal fun decideWeightSyncScheduleAction(
    isCheckingSession: Boolean,
    isAuthenticated: Boolean,
    connectionState: WearableConnectionUiState,
): WeightSyncScheduleAction {
    if (isCheckingSession) {
        return WeightSyncScheduleAction.None
    }
    if (!isAuthenticated) {
        return WeightSyncScheduleAction.CancelAll
    }

    val readyState = connectionState as? WearableConnectionUiState.Ready
        ?: return WeightSyncScheduleAction.None
    return if (
        readyState.backgroundReadAccess === BackgroundReadAccess.Granted
    ) {
        WeightSyncScheduleAction.Schedule(readyState.connection.id)
    } else {
        WeightSyncScheduleAction.None
    }
}
