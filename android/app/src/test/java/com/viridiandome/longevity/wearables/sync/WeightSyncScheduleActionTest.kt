package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.BackgroundReadAccess
import com.viridiandome.longevity.wearables.WearableConnectionUiState
import com.viridiandome.longevity.wearables.network.WearableConnectionResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class WeightSyncScheduleActionTest {
    @Test
    fun session_check_does_not_cancel_durable_work() {
        val action = decideWeightSyncScheduleAction(
            isCheckingSession = true,
            isAuthenticated = false,
            connectionState = WearableConnectionUiState.Idle,
        )

        assertSame(WeightSyncScheduleAction.None, action)
    }

    @Test
    fun confirmed_logged_out_session_cancels_weight_sync_work() {
        val action = decideWeightSyncScheduleAction(
            isCheckingSession = false,
            isAuthenticated = false,
            connectionState = WearableConnectionUiState.Idle,
        )

        assertSame(WeightSyncScheduleAction.CancelAll, action)
    }

    @Test
    fun ready_connection_with_background_access_is_scheduled() {
        val action = decideWeightSyncScheduleAction(
            isCheckingSession = false,
            isAuthenticated = true,
            connectionState = readyConnection(BackgroundReadAccess.Granted),
        )

        assertEquals(WeightSyncScheduleAction.Schedule(CONNECTION_ID), action)
    }

    @Test
    fun missing_background_access_does_not_schedule_work() {
        val action = decideWeightSyncScheduleAction(
            isCheckingSession = false,
            isAuthenticated = true,
            connectionState = readyConnection(
                BackgroundReadAccess.PermissionRequired,
            ),
        )

        assertSame(WeightSyncScheduleAction.None, action)
    }

    @Test
    fun unresolved_connection_does_not_change_durable_work() {
        val action = decideWeightSyncScheduleAction(
            isCheckingSession = false,
            isAuthenticated = true,
            connectionState = WearableConnectionUiState.Idle,
        )

        assertSame(WeightSyncScheduleAction.None, action)
    }

    private fun readyConnection(
        backgroundReadAccess: BackgroundReadAccess,
    ): WearableConnectionUiState.Ready =
        WearableConnectionUiState.Ready(
            connection = WearableConnectionResponse(
                id = CONNECTION_ID,
                provider = "health_connect",
                status = "active",
                lastSyncedAt = null,
                lastError = "",
                createdAt = "2026-08-08T08:00:00Z",
                updatedAt = "2026-08-08T08:00:00Z",
            ),
            backgroundReadAccess = backgroundReadAccess,
        )

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
    }
}
