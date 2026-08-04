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
            val viewModel = WearableConnectionViewModel(repository)

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
        val viewModel = WearableConnectionViewModel(repository)
        runCurrent()

        repository.complete(WearableConnectionResolutionResult.Rejected)
        advanceUntilIdle()

        assertSame(WearableConnectionUiState.Rejected, viewModel.state.value)
    }

    @Test
    fun lost_session_remains_a_distinct_ui_state() = runTest {
        val repository = ControllableWearableConnectionRepository()
        val viewModel = WearableConnectionViewModel(repository)
        runCurrent()

        repository.complete(WearableConnectionResolutionResult.NoSession)
        advanceUntilIdle()

        assertSame(WearableConnectionUiState.NoSession, viewModel.state.value)
    }

    @Test
    fun temporary_failure_remains_an_unavailable_ui_state() = runTest {
        val repository = ControllableWearableConnectionRepository()
        val viewModel = WearableConnectionViewModel(repository)
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
        val viewModel = WearableConnectionViewModel(repository)
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
        val viewModel = WearableConnectionViewModel(repository)
        runCurrent()
        assertEquals(1, repository.resolutionRequests)

        viewModel.retry()
        runCurrent()

        assertEquals(1, repository.resolutionRequests)
        assertSame(WearableConnectionUiState.Loading, viewModel.state.value)
    }
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
