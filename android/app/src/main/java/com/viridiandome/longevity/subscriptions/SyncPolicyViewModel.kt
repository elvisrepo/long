package com.viridiandome.longevity.subscriptions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** UI-safe representation of the current server-owned sync entitlement. */
sealed interface SyncPolicyUiState {
    data object Idle : SyncPolicyUiState

    data object Loading : SyncPolicyUiState

    data class Ready(val policy: SyncPolicy) : SyncPolicyUiState

    data object NoSession : SyncPolicyUiState

    data object Unavailable : SyncPolicyUiState
}

/** Loads subscription sync policy without coupling Compose to HTTP details. */
class SyncPolicyViewModel(
    private val repository: SyncPolicyRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<SyncPolicyUiState>(SyncPolicyUiState.Idle)
    val state: StateFlow<SyncPolicyUiState> = _state.asStateFlow()
    private var loadJob: Job? = null

    fun load() {
        if (loadJob?.isActive == true) {
            return
        }

        _state.value = SyncPolicyUiState.Loading
        loadJob = viewModelScope.launch {
            _state.value = try {
                when (val result = repository.getCurrentSyncPolicy()) {
                    is SyncPolicyResult.Success -> SyncPolicyUiState.Ready(result.policy)
                    SyncPolicyResult.NoSession -> SyncPolicyUiState.NoSession
                    SyncPolicyResult.Unavailable -> SyncPolicyUiState.Unavailable
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Exception) {
                SyncPolicyUiState.Unavailable
            }
        }
    }

    fun resetForLogout() {
        loadJob?.cancel()
        loadJob = null
        _state.value = SyncPolicyUiState.Idle
    }
}

class SyncPolicyViewModelFactory(
    private val repository: SyncPolicyRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        require(modelClass.isAssignableFrom(SyncPolicyViewModel::class.java)) {
            "Unsupported ViewModel class: ${modelClass.name}"
        }
        return SyncPolicyViewModel(repository) as T
    }
}
