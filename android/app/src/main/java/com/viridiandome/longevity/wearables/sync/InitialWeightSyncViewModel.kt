package com.viridiandome.longevity.wearables.sync

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.viridiandome.longevity.wearables.WearableUploadReceipt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Health-safe presentation state for one explicit weight sync. */
sealed interface InitialWeightSyncUiState {
    data object Idle : InitialWeightSyncUiState

    data object Syncing : InitialWeightSyncUiState

    data object NoData : InitialWeightSyncUiState

    data class Completed(
        val batchCount: Int,
        val entriesImported: Int,
        val entriesSkipped: Int,
    ) : InitialWeightSyncUiState

    data class Interrupted(
        val completedBatchCount: Int,
        val entriesImported: Int,
        val entriesSkipped: Int,
        val failure: InitialWeightSyncFailure,
    ) : InitialWeightSyncUiState

    /** Unexpected application failure; safe to show without exception details. */
    data object Unavailable : InitialWeightSyncUiState
}

/** Converts coordinator results into state that Compose can render safely. */
class InitialWeightSyncViewModel(
    private val runner: InitialWeightSyncRunner,
) : ViewModel() {
    private val _state = MutableStateFlow<InitialWeightSyncUiState>(
        InitialWeightSyncUiState.Idle,
    )
    val state: StateFlow<InitialWeightSyncUiState> = _state.asStateFlow()
    private var syncJob: Job? = null

    fun sync(connectionId: String) {
        if (syncJob?.isActive == true) {
            return
        }

        _state.value = InitialWeightSyncUiState.Syncing
        syncJob = viewModelScope.launch {
            _state.value = try {
                runner.sync(connectionId).toUiState()
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Exception) {
                InitialWeightSyncUiState.Unavailable
            }
        }
    }

    fun resetForLogout() {
        syncJob?.cancel()
        syncJob = null
        _state.value = InitialWeightSyncUiState.Idle
    }

    private fun InitialWeightSyncResult.toUiState(): InitialWeightSyncUiState =
        when (this) {
            is InitialWeightSyncResult.Completed ->
                receipts.toCompletedUiState()

            InitialWeightSyncResult.NoData -> InitialWeightSyncUiState.NoData

            is InitialWeightSyncResult.Interrupted ->
                InitialWeightSyncUiState.Interrupted(
                    completedBatchCount = completedReceipts.size,
                    entriesImported = completedReceipts.sumOf(
                        WearableUploadReceipt::entriesImported,
                    ),
                    entriesSkipped = completedReceipts.sumOf(
                        WearableUploadReceipt::entriesSkipped,
                    ),
                    failure = failure,
                )
        }

    private fun List<WearableUploadReceipt>.toCompletedUiState():
        InitialWeightSyncUiState.Completed =
        InitialWeightSyncUiState.Completed(
            batchCount = size,
            entriesImported = sumOf(WearableUploadReceipt::entriesImported),
            entriesSkipped = sumOf(WearableUploadReceipt::entriesSkipped),
        )
}
