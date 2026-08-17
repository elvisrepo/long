package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.WearableUploadReceipt
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
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
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@OptIn(ExperimentalCoroutinesApi::class)
class InitialWeightSyncViewModelTest {
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
    fun unconfigured_manual_sync_does_not_run() = runTest {
        val runner = ControllableInitialWeightSyncRunner()
        val viewModel = InitialWeightSyncViewModel(runner)

        viewModel.sync(CONNECTION_ID)
        runCurrent()

        assertEquals(0, runner.requests)
        assertSame(InitialWeightSyncUiState.Idle, viewModel.state.value)
    }

    @Test
    fun explicit_sync_publishes_completed_batch_summary() = runTest {
        val runner = ControllableInitialWeightSyncRunner()
        val viewModel = InitialWeightSyncViewModel(runner)

        assertSame(InitialWeightSyncUiState.Idle, viewModel.state.value)
        assertEquals(0, runner.requests)

        viewModel.configureAvailableManualSync()
        runCurrent()
        viewModel.sync(CONNECTION_ID)

        assertSame(InitialWeightSyncUiState.Syncing, viewModel.state.value)
        runCurrent()
        assertEquals(1, runner.requests)
        assertEquals(CONNECTION_ID, runner.connectionId)

        runner.complete(
            WeightSyncResult.Completed(
                receipts = listOf(successfulReceipt()),
            ),
        )
        advanceUntilIdle()

        assertEquals(
            InitialWeightSyncUiState.Completed(
                batchCount = 1,
                entriesImported = 1,
                entriesSkipped = 0,
            ),
            viewModel.state.value,
        )
    }

    @Test
    fun repeated_tap_does_not_overlap_an_active_sync() = runTest {
        val runner = ControllableInitialWeightSyncRunner()
        val viewModel = InitialWeightSyncViewModel(runner)

        viewModel.configureAvailableManualSync()
        runCurrent()
        viewModel.sync(CONNECTION_ID)
        runCurrent()
        viewModel.sync(CONNECTION_ID)
        runCurrent()

        assertEquals(1, runner.requests)
        assertSame(InitialWeightSyncUiState.Syncing, viewModel.state.value)
    }

    @Test
    fun manual_sync_is_blocked_until_the_plan_cooldown_has_elapsed() = runTest {
        val runner = ControllableInitialWeightSyncRunner()
        val lastSuccessfulSyncAt = Instant.parse("2026-08-08T10:00:00Z")
        val viewModel = InitialWeightSyncViewModel(
            runner = runner,
            cursorStore = FixedWeightSyncCursorStore(lastSuccessfulSyncAt),
            clock = Clock.fixed(
                Instant.parse("2026-08-08T10:20:00Z"),
                ZoneOffset.UTC,
            ),
        )

        viewModel.configureManualSync(
            connectionId = CONNECTION_ID,
            cooldownMinutes = 30,
            backendLastSyncedAt = null,
        )
        runCurrent()

        assertEquals(
            ManualSyncAvailability.CoolingDown(
                availableAt = Instant.parse("2026-08-08T10:30:00Z"),
            ),
            viewModel.manualSyncAvailability.value,
        )

        viewModel.configureAvailableManualSync()
        runCurrent()
        viewModel.sync(CONNECTION_ID)
        runCurrent()

        assertEquals(0, runner.requests)

        advanceTimeBy(10 * 60 * 1_000L)
        runCurrent()

        assertSame(
            ManualSyncAvailability.Available,
            viewModel.manualSyncAvailability.value,
        )
    }

    @Test
    fun empty_sync_window_is_a_no_data_state() = runTest {
        val viewModel = InitialWeightSyncViewModel(
            FixedInitialWeightSyncRunner(WeightSyncResult.NoData),
        )

        viewModel.configureAvailableManualSync()
        runCurrent()
        viewModel.sync(CONNECTION_ID)
        advanceUntilIdle()

        assertSame(InitialWeightSyncUiState.NoData, viewModel.state.value)
    }

    @Test
    fun successful_no_data_sync_starts_the_plan_cooldown() = runTest {
        val now = Instant.parse("2026-08-08T10:00:00Z")
        val viewModel = InitialWeightSyncViewModel(
            runner = FixedInitialWeightSyncRunner(WeightSyncResult.NoData),
            cursorStore = FixedWeightSyncCursorStore(cursor = null),
            clock = Clock.fixed(now, ZoneOffset.UTC),
        )
        viewModel.configureManualSync(
            connectionId = CONNECTION_ID,
            cooldownMinutes = 30,
            backendLastSyncedAt = null,
        )
        runCurrent()
        assertSame(
            ManualSyncAvailability.Available,
            viewModel.manualSyncAvailability.value,
        )

        viewModel.sync(CONNECTION_ID)
        runCurrent()

        assertSame(InitialWeightSyncUiState.NoData, viewModel.state.value)
        assertEquals(
            ManualSyncAvailability.CoolingDown(
                availableAt = Instant.parse("2026-08-08T10:30:00Z"),
            ),
            viewModel.manualSyncAvailability.value,
        )
    }

    @Test
    fun interrupted_sync_exposes_only_completed_counts_and_recovery_reason() = runTest {
        val viewModel = InitialWeightSyncViewModel(
            FixedInitialWeightSyncRunner(
                WeightSyncResult.Interrupted(
                    completedReceipts = listOf(successfulReceipt()),
                    failure = WeightSyncFailure.PermissionRequired,
                ),
            ),
        )

        viewModel.configureAvailableManualSync()
        runCurrent()
        viewModel.sync(CONNECTION_ID)
        advanceUntilIdle()

        assertEquals(
            InitialWeightSyncUiState.Interrupted(
                completedBatchCount = 1,
                entriesImported = 1,
                entriesSkipped = 0,
                failure = WeightSyncFailure.PermissionRequired,
            ),
            viewModel.state.value,
        )
    }

    @Test
    fun logout_cancels_sync_and_clears_previous_user_state() = runTest {
        val runner = ControllableInitialWeightSyncRunner()
        val viewModel = InitialWeightSyncViewModel(runner)
        viewModel.configureAvailableManualSync()
        runCurrent()
        viewModel.sync(CONNECTION_ID)
        runCurrent()

        viewModel.resetForLogout()
        runner.complete(
            WeightSyncResult.Completed(
                receipts = listOf(successfulReceipt()),
            ),
        )
        advanceUntilIdle()

        assertSame(InitialWeightSyncUiState.Idle, viewModel.state.value)
    }

    private fun successfulReceipt(): WearableUploadReceipt =
        WearableUploadReceipt(
            id = "6ac744c4-8202-4cd7-91c7-3d44ea067381",
            connectionId = CONNECTION_ID,
            uploadId = "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34",
            status = "succeeded",
            receivedAt = Instant.parse("2026-08-05T12:00:01Z"),
            processingStartedAt = Instant.parse("2026-08-05T12:00:01Z"),
            finishedAt = Instant.parse("2026-08-05T12:00:02Z"),
            entriesImported = 1,
            entriesSkipped = 0,
        )

    private fun InitialWeightSyncViewModel.configureAvailableManualSync() {
        configureManualSync(
            connectionId = CONNECTION_ID,
            cooldownMinutes = 30,
            backendLastSyncedAt = null,
        )
    }

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
    }
}

private class ControllableInitialWeightSyncRunner : WeightSyncRunner {
    private val result = CompletableDeferred<WeightSyncResult>()

    var requests = 0
        private set
    var connectionId: String? = null
        private set

    override suspend fun sync(connectionId: String): WeightSyncResult {
        requests += 1
        this.connectionId = connectionId
        return result.await()
    }

    fun complete(value: WeightSyncResult) {
        result.complete(value)
    }
}

private class FixedInitialWeightSyncRunner(
    private val result: WeightSyncResult,
) : WeightSyncRunner {
    override suspend fun sync(connectionId: String): WeightSyncResult = result
}

private class FixedWeightSyncCursorStore(
    private val cursor: Instant?,
) : WeightSyncCursorStore {
    override suspend fun read(connectionId: String): Instant? = cursor

    override suspend fun write(connectionId: String, cursor: Instant) = Unit

    override suspend fun remove(connectionId: String) = Unit
}
