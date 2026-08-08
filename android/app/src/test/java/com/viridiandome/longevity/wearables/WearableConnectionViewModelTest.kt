package com.viridiandome.longevity.wearables

import com.viridiandome.longevity.wearables.network.WearableConnectionResponse
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WearableConnectionViewModelTest {
    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun connection_resolution_stays_loading_until_health_connect_is_ready() =
        runTest {
            val repository = ControllableWearableConnectionRepository()
            val viewModel = WearableConnectionViewModel(
                repository,
                GrantedWeightReadHealthConnectAccess,
            )

            assertSame(WearableConnectionUiState.Idle, viewModel.state.value)
            assertEquals(0, repository.resolutionRequests)

            viewModel.load()

            assertSame(WearableConnectionUiState.Loading, viewModel.state.value)
            runCurrent()
            assertEquals(1, repository.resolutionRequests)
            assertSame(WearableConnectionUiState.Loading, viewModel.state.value)

            val connection = healthConnectConnection(status = "pending")
            repository.complete(
                WearableConnectionResolutionResult.Success(connection),
            )
            advanceUntilIdle()

            assertEquals(
                WearableConnectionUiState.Ready(connection),
                viewModel.state.value,
            )
        }

    @Test
    fun rejected_registration_remains_a_distinct_ui_state() = runTest {
        val repository = ControllableWearableConnectionRepository()
        val viewModel = WearableConnectionViewModel(
            repository,
            GrantedWeightReadHealthConnectAccess,
        )
        viewModel.load()
        runCurrent()

        repository.complete(WearableConnectionResolutionResult.Rejected)
        advanceUntilIdle()

        assertSame(WearableConnectionUiState.Rejected, viewModel.state.value)
    }

    @Test
    fun lost_session_remains_a_distinct_ui_state() = runTest {
        val repository = ControllableWearableConnectionRepository()
        val viewModel = WearableConnectionViewModel(
            repository,
            GrantedWeightReadHealthConnectAccess,
        )
        viewModel.load()
        runCurrent()

        repository.complete(WearableConnectionResolutionResult.NoSession)
        advanceUntilIdle()

        assertSame(WearableConnectionUiState.NoSession, viewModel.state.value)
    }

    @Test
    fun temporary_failure_remains_an_unavailable_ui_state() = runTest {
        val repository = ControllableWearableConnectionRepository()
        val viewModel = WearableConnectionViewModel(
            repository,
            GrantedWeightReadHealthConnectAccess,
        )
        viewModel.load()
        runCurrent()

        repository.complete(WearableConnectionResolutionResult.Unavailable)
        advanceUntilIdle()

        assertSame(
            WearableConnectionUiState.Unavailable,
            viewModel.state.value,
        )
    }

    @Test
    fun retry_resolves_health_connect_again_after_temporary_failure() = runTest {
        val connection = healthConnectConnection(status = "connected")
        val repository = SequencedWearableConnectionRepository(
            WearableConnectionResolutionResult.Unavailable,
            WearableConnectionResolutionResult.Success(connection),
        )
        val viewModel = WearableConnectionViewModel(
            repository,
            GrantedWeightReadHealthConnectAccess,
        )
        viewModel.load()
        advanceUntilIdle()
        assertSame(
            WearableConnectionUiState.Unavailable,
            viewModel.state.value,
        )

        viewModel.retry()

        assertSame(WearableConnectionUiState.Loading, viewModel.state.value)
        advanceUntilIdle()
        assertEquals(WearableConnectionUiState.Ready(connection), viewModel.state.value)
        assertEquals(2, repository.resolutionRequests)
    }

    @Test
    fun retry_does_not_overlap_an_active_resolution_request() = runTest {
        val repository = ControllableWearableConnectionRepository()
        val viewModel = WearableConnectionViewModel(
            repository,
            GrantedWeightReadHealthConnectAccess,
        )
        viewModel.load()
        runCurrent()
        assertEquals(1, repository.resolutionRequests)

        viewModel.retry()
        runCurrent()

        assertEquals(1, repository.resolutionRequests)
        assertSame(WearableConnectionUiState.Loading, viewModel.state.value)
    }

    @Test
    fun clear_cancels_resolution_and_removes_previous_user_state() = runTest {
        val repository = ControllableWearableConnectionRepository()
        val viewModel = WearableConnectionViewModel(
            repository,
            GrantedWeightReadHealthConnectAccess,
        )
        viewModel.load()
        runCurrent()

        viewModel.resetForLogout()
        repository.complete(
            WearableConnectionResolutionResult.Success(
                healthConnectConnection(status = "connected"),
            ),
        )
        advanceUntilIdle()

        assertSame(WearableConnectionUiState.Idle, viewModel.state.value)
    }

    @Test
    fun unavailable_health_connect_stops_before_backend_registration() = runTest {
        val repository = ControllableWearableConnectionRepository()
        val viewModel = WearableConnectionViewModel(
            repository,
            FixedHealthConnectAccess(WeightReadAccess.Unavailable),
        )

        viewModel.load()
        advanceUntilIdle()

        assertSame(
            WearableConnectionUiState.HealthConnectUnavailable,
            viewModel.state.value,
        )
        assertEquals(0, repository.resolutionRequests)
    }

    @Test
    fun missing_weight_permission_stops_before_backend_registration() = runTest {
        val repository = ControllableWearableConnectionRepository()
        val viewModel = WearableConnectionViewModel(
            repository,
            FixedHealthConnectAccess(WeightReadAccess.PermissionRequired),
        )

        viewModel.load()
        advanceUntilIdle()

        assertSame(
            WearableConnectionUiState.PermissionRequired,
            viewModel.state.value,
        )
        assertEquals(0, repository.resolutionRequests)
    }

    @Test
    fun granted_weight_permission_continues_backend_registration() = runTest {
        val repository = ControllableWearableConnectionRepository()
        val viewModel = WearableConnectionViewModel(
            repository,
            FixedHealthConnectAccess(WeightReadAccess.PermissionRequired),
        )
        viewModel.load()
        advanceUntilIdle()

        viewModel.onWeightReadPermissionResult(isGranted = true)
        runCurrent()

        assertEquals(1, repository.resolutionRequests)
        val connection = healthConnectConnection(status = "pending")
        repository.complete(
            WearableConnectionResolutionResult.Success(connection),
        )
        advanceUntilIdle()
        assertEquals(
            WearableConnectionUiState.Ready(connection),
            viewModel.state.value,
        )
    }

    @Test
    fun missing_background_permission_keeps_foreground_connection_ready() = runTest {
        val connection = healthConnectConnection(status = "connected")
        val repository = SequencedWearableConnectionRepository(
            WearableConnectionResolutionResult.Success(connection),
        )
        val viewModel = WearableConnectionViewModel(
            repository,
            FixedHealthConnectAccess(
                access = WeightReadAccess.Granted,
                backgroundAccess = BackgroundReadAccess.PermissionRequired,
            ),
        )

        viewModel.load()
        advanceUntilIdle()

        assertEquals(
            WearableConnectionUiState.Ready(
                connection = connection,
                backgroundReadAccess = BackgroundReadAccess.PermissionRequired,
            ),
            viewModel.state.value,
        )
    }

    @Test
    fun granted_background_permission_updates_ready_state_without_reregistering() =
        runTest {
            val connection = healthConnectConnection(status = "connected")
            val repository = SequencedWearableConnectionRepository(
                WearableConnectionResolutionResult.Success(connection),
            )
            val viewModel = WearableConnectionViewModel(
                repository,
                FixedHealthConnectAccess(
                    access = WeightReadAccess.Granted,
                    backgroundAccess = BackgroundReadAccess.PermissionRequired,
                ),
            )
            viewModel.load()
            advanceUntilIdle()

            viewModel.onBackgroundReadPermissionResult(isGranted = true)

            assertEquals(
                WearableConnectionUiState.Ready(
                    connection = connection,
                    backgroundReadAccess = BackgroundReadAccess.Granted,
                ),
                viewModel.state.value,
            )
            assertEquals(1, repository.resolutionRequests)
        }

    @Test
    fun denied_background_permission_remains_retryable_without_reregistering() =
        runTest {
            val connection = healthConnectConnection(status = "connected")
            val repository = SequencedWearableConnectionRepository(
                WearableConnectionResolutionResult.Success(connection),
            )
            val viewModel = WearableConnectionViewModel(
                repository,
                FixedHealthConnectAccess(
                    access = WeightReadAccess.Granted,
                    backgroundAccess = BackgroundReadAccess.PermissionRequired,
                ),
            )
            viewModel.load()
            advanceUntilIdle()

            viewModel.onBackgroundReadPermissionResult(isGranted = false)

            assertEquals(
                WearableConnectionUiState.Ready(
                    connection = connection,
                    backgroundReadAccess = BackgroundReadAccess.PermissionRequired,
                ),
                viewModel.state.value,
            )
            assertEquals(1, repository.resolutionRequests)
        }

    @Test
    fun denied_weight_permission_does_not_register_backend_connection() = runTest {
        val repository = ControllableWearableConnectionRepository()
        val viewModel = WearableConnectionViewModel(
            repository,
            FixedHealthConnectAccess(WeightReadAccess.PermissionRequired),
        )
        viewModel.load()
        advanceUntilIdle()

        viewModel.onWeightReadPermissionResult(isGranted = false)

        assertSame(
            WearableConnectionUiState.PermissionDenied,
            viewModel.state.value,
        )
        assertEquals(0, repository.resolutionRequests)
    }

    @Test
    fun health_connect_check_failure_becomes_retryable_unavailable_state() =
        runTest {
            val repository = ControllableWearableConnectionRepository()
            val viewModel = WearableConnectionViewModel(
                repository,
                FailingHealthConnectAccess,
            )

            viewModel.load()
            advanceUntilIdle()

            assertSame(
                WearableConnectionUiState.Unavailable,
                viewModel.state.value,
            )
            assertEquals(0, repository.resolutionRequests)
        }
}

private data class FixedHealthConnectAccess(
    private val access: WeightReadAccess,
    private val backgroundAccess: BackgroundReadAccess =
        BackgroundReadAccess.Unavailable,
) : HealthConnectAccess {
    override suspend fun getWeightReadAccess(): WeightReadAccess = access

    override suspend fun getBackgroundReadAccess(): BackgroundReadAccess =
        backgroundAccess
}

private object GrantedWeightReadHealthConnectAccess : HealthConnectAccess {
    override suspend fun getWeightReadAccess(): WeightReadAccess =
        WeightReadAccess.Granted
}

private object FailingHealthConnectAccess : HealthConnectAccess {
    override suspend fun getWeightReadAccess(): WeightReadAccess =
        error("Health Connect changed while checking availability.")
}

private class ControllableWearableConnectionRepository :
    WearableConnectionRepository {
    private val resolution =
        CompletableDeferred<WearableConnectionResolutionResult>()

    var resolutionRequests = 0
        private set

    override suspend fun getOrRegisterHealthConnect():
        WearableConnectionResolutionResult {
        resolutionRequests += 1
        return resolution.await()
    }

    fun complete(result: WearableConnectionResolutionResult) {
        resolution.complete(result)
    }

    override suspend fun getConnections(): WearableConnectionsResult =
        error("Direct connection reads are not expected from the ViewModel.")

    override suspend fun registerHealthConnect():
        WearableConnectionRegistrationResult =
        error("Direct registration is not expected from the ViewModel.")
}

private class SequencedWearableConnectionRepository(
    vararg results: WearableConnectionResolutionResult,
) : WearableConnectionRepository {
    private val remainingResults = ArrayDeque(results.toList())

    var resolutionRequests = 0
        private set

    override suspend fun getOrRegisterHealthConnect():
        WearableConnectionResolutionResult {
        resolutionRequests += 1
        return remainingResults.removeFirst()
    }

    override suspend fun getConnections(): WearableConnectionsResult =
        error("Direct connection reads are not expected from the ViewModel.")

    override suspend fun registerHealthConnect():
        WearableConnectionRegistrationResult =
        error("Direct registration is not expected from the ViewModel.")
}

private fun healthConnectConnection(
    status: String,
): WearableConnectionResponse =
    WearableConnectionResponse(
        id = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
        provider = "health_connect",
        status = status,
        lastSyncedAt = null,
        lastError = "",
        createdAt = "2026-08-04T10:00:00Z",
        updatedAt = "2026-08-04T10:00:00Z",
    )
