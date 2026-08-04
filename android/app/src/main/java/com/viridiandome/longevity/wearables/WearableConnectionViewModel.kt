package com.viridiandome.longevity.wearables

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.viridiandome.longevity.wearables.network.WearableConnectionResponse
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** UI state for resolving the signed-in user's Health Connect connection. */
sealed interface WearableConnectionUiState {
    data object Loading : WearableConnectionUiState

    data class Ready(
        val connection: WearableConnectionResponse,
    ) : WearableConnectionUiState

    data object Rejected : WearableConnectionUiState

    data object NoSession : WearableConnectionUiState

    data object Unavailable : WearableConnectionUiState
}

/** Coordinates Health Connect registration without exposing HTTP details to Compose. */
class WearableConnectionViewModel(
    private val repository: WearableConnectionRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<WearableConnectionUiState>(
        WearableConnectionUiState.Loading,
    )
    val state: StateFlow<WearableConnectionUiState> = _state.asStateFlow()
    private var resolutionJob: Job? = null

    init {
        resolveHealthConnectConnection()
    }

    fun retry() {
        resolveHealthConnectConnection()
    }

    private fun resolveHealthConnectConnection() {
        if (resolutionJob?.isActive == true) {
            return
        }

        _state.value = WearableConnectionUiState.Loading
        resolutionJob = viewModelScope.launch {
            _state.value = when (
                val result = repository.getOrRegisterHealthConnect()
            ) {
                is WearableConnectionResolutionResult.Success ->
                    WearableConnectionUiState.Ready(result.connection)

                WearableConnectionResolutionResult.Rejected ->
                    WearableConnectionUiState.Rejected

                WearableConnectionResolutionResult.NoSession ->
                    WearableConnectionUiState.NoSession

                WearableConnectionResolutionResult.Unavailable ->
                    WearableConnectionUiState.Unavailable
            }
        }
    }
}
