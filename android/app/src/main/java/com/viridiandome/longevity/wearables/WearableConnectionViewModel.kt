package com.viridiandome.longevity.wearables

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.viridiandome.longevity.wearables.network.WearableConnectionResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** UI state for resolving the signed-in user's Health Connect connection. */
sealed interface WearableConnectionUiState {
    data object Idle : WearableConnectionUiState

    data object Loading : WearableConnectionUiState

    data object PermissionRequired : WearableConnectionUiState

    data object PermissionDenied : WearableConnectionUiState

    data object ProviderUpdateRequired : WearableConnectionUiState

    data object HealthConnectUnavailable : WearableConnectionUiState

    data class Ready(
        val connection: WearableConnectionResponse,
        val backgroundReadAccess: BackgroundReadAccess =
            BackgroundReadAccess.Unavailable,
        val isDisconnecting: Boolean = false,
        val disconnectFailed: Boolean = false,
    ) : WearableConnectionUiState

    data object Rejected : WearableConnectionUiState

    data object NoSession : WearableConnectionUiState

    data object Unavailable : WearableConnectionUiState
}

/** Coordinates Health Connect registration without exposing HTTP details to Compose. */
class WearableConnectionViewModel(
    private val repository: WearableConnectionRepository,
    private val healthConnectAccess: HealthConnectAccess,
) : ViewModel() {
    private val _state = MutableStateFlow<WearableConnectionUiState>(
        WearableConnectionUiState.Idle,
    )
    val state: StateFlow<WearableConnectionUiState> = _state.asStateFlow()
    private var resolutionJob: Job? = null

    fun load() {
        resolveHealthConnectConnection()
    }

    fun retry() {
        resolveHealthConnectConnection()
    }

    /**
     * Re-reads the caller's backend connections and refreshes the displayed
     * row when it is still present. This runs after a sync terminal state so
     * the visible last-sync timestamp cannot lag behind Django. It never
     * shows a loading state and never touches permissions: failures and a
     * missing row keep the current UI untouched.
     */
    fun refreshConnectionStatus() {
        val readyState = _state.value as? WearableConnectionUiState.Ready
            ?: return
        if (resolutionJob?.isActive == true) {
            return
        }

        resolutionJob = viewModelScope.launch {
            try {
                when (val result = repository.getConnections()) {
                    is WearableConnectionsResult.Success ->
                        result.connections
                            .firstOrNull { it.id == readyState.connection.id }
                            ?.let { fresh ->
                                _state.value = readyState.copy(connection = fresh)
                            }

                    else -> Unit
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Exception) {
                // A failed refresh keeps the last known row. The sync result
                // text already describes the outcome; the next load repairs this.
            }
        }
    }

    fun disconnect() {
        val readyState = _state.value as? WearableConnectionUiState.Ready
            ?: return
        if (readyState.isDisconnecting || resolutionJob?.isActive == true) {
            return
        }

        _state.value = readyState.copy(
            isDisconnecting = true,
            disconnectFailed = false,
        )
        resolutionJob = viewModelScope.launch {
            _state.value = try {
                when (repository.disconnect(readyState.connection.id)) {
                    WearableConnectionDisconnectResult.Success ->
                        WearableConnectionUiState.Idle

                    WearableConnectionDisconnectResult.NoSession ->
                        WearableConnectionUiState.NoSession

                    WearableConnectionDisconnectResult.Unavailable ->
                        readyState.copy(disconnectFailed = true)
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Exception) {
                readyState.copy(disconnectFailed = true)
            }
        }
    }

    fun onWeightReadPermissionResult(isGranted: Boolean) {
        if (!isGranted) {
            _state.value = WearableConnectionUiState.PermissionDenied
            return
        }

        resolveBackendAfterPermissionGrant()
    }

    fun onBackgroundReadPermissionResult(isGranted: Boolean) {
        val readyState =
            _state.value as? WearableConnectionUiState.Ready ?: return
        _state.value = readyState.copy(
            backgroundReadAccess = if (isGranted) {
                BackgroundReadAccess.Granted
            } else {
                BackgroundReadAccess.PermissionRequired
            },
        )
    }

    fun resetForLogout() {
        resolutionJob?.cancel()
        resolutionJob = null
        _state.value = WearableConnectionUiState.Idle
    }

    private fun resolveHealthConnectConnection() {
        if (resolutionJob?.isActive == true) {
            return
        }

        _state.value = WearableConnectionUiState.Loading
        resolutionJob = viewModelScope.launch {
            _state.value = try {
                when (healthConnectAccess.getWeightReadAccess()) {
                    WeightReadAccess.Granted -> resolveBackendConnection()

                    WeightReadAccess.PermissionRequired ->
                        WearableConnectionUiState.PermissionRequired

                    WeightReadAccess.ProviderUpdateRequired ->
                        WearableConnectionUiState.ProviderUpdateRequired

                    WeightReadAccess.Unavailable ->
                        WearableConnectionUiState.HealthConnectUnavailable
                }
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Exception) {
                WearableConnectionUiState.Unavailable
            }
        }
    }

    private fun resolveBackendAfterPermissionGrant() {
        if (resolutionJob?.isActive == true) {
            return
        }

        _state.value = WearableConnectionUiState.Loading
        resolutionJob = viewModelScope.launch {
            _state.value = resolveBackendConnection()
        }
    }

    private suspend fun resolveBackendConnection(): WearableConnectionUiState =
        when (val result = repository.getOrRegisterHealthConnect()) {
            is WearableConnectionResolutionResult.Success ->
                WearableConnectionUiState.Ready(
                    connection = result.connection,
                    backgroundReadAccess = resolveBackgroundReadAccess(),
                )

            WearableConnectionResolutionResult.Rejected ->
                WearableConnectionUiState.Rejected

            WearableConnectionResolutionResult.NoSession ->
                WearableConnectionUiState.NoSession

            WearableConnectionResolutionResult.Unavailable ->
                WearableConnectionUiState.Unavailable
        }

    private suspend fun resolveBackgroundReadAccess(): BackgroundReadAccess =
        try {
            healthConnectAccess.getBackgroundReadAccess()
        } catch (exception: CancellationException) {
            throw exception
        } catch (_: Exception) {
            // Background capability is optional. A feature-check failure must
            // not disable the already-working explicit foreground sync.
            BackgroundReadAccess.Unavailable
        }
}
