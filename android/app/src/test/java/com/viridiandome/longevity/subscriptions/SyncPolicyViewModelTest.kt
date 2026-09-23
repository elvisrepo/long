package com.viridiandome.longevity.subscriptions

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SyncPolicyViewModelTest {
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
    fun load_exposes_the_server_owned_sync_policy() = runTest {
        val expectedPolicy = SyncPolicy(
            automaticSyncEnabled = false,
            syncIntervalMinutes = 30,
        )
        val viewModel = SyncPolicyViewModel(
            FixedSyncPolicyRepository(
                SyncPolicyResult.Success(expectedPolicy),
            ),
        )

        assertSame(SyncPolicyUiState.Idle, viewModel.state.value)

        viewModel.load()
        advanceUntilIdle()

        assertEquals(
            SyncPolicyUiState.Ready(expectedPolicy),
            viewModel.state.value,
        )
    }
}

private class FixedSyncPolicyRepository(
    private val result: SyncPolicyResult,
) : SyncPolicyRepository {
    override suspend fun getCurrentSyncPolicy(): SyncPolicyResult = result
}
