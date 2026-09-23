package com.viridiandome.longevity.wearables.sync

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.viridiandome.longevity.wearables.WearableUploadReceipt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Clock
import java.time.Duration
import java.time.Instant

/** Health-safe presentation state for one explicit supported-metrics sync. */
sealed interface InitialWeightSyncUiState {
    data object Idle : InitialWeightSyncUiState

    data object Syncing : InitialWeightSyncUiState

    data object NoData : InitialWeightSyncUiState

    data class Completed(
        val batchCount: Int,
        val entriesImported: Int,
        val entriesSkipped: Int,
        val entriesUpdated: Int = 0,
    ) : InitialWeightSyncUiState

    data class Interrupted(
        val completedBatchCount: Int,
        val entriesImported: Int,
        val entriesSkipped: Int,
        val failure: WeightSyncFailure,
        val entriesUpdated: Int = 0,
    ) : InitialWeightSyncUiState

    /** Unexpected application failure; safe to show without exception details. */
    data object Unavailable : InitialWeightSyncUiState
}

/** Whether the current plan permits another explicit foreground sync. */
sealed interface ManualSyncAvailability {
    data object Unconfigured : ManualSyncAvailability

    data object Checking : ManualSyncAvailability

    data object Available : ManualSyncAvailability

    data class CoolingDown(val availableAt: Instant) : ManualSyncAvailability

    data object Unavailable : ManualSyncAvailability
}

/** Converts coordinator results into state that Compose can render safely. */
class InitialWeightSyncViewModel(
    private val runner: WeightSyncRunner,
    private val cursorStore: WeightSyncCursorStore? = null,
    private val clock: Clock = Clock.systemUTC(),
) : ViewModel() {
    private val _state = MutableStateFlow<InitialWeightSyncUiState>(
        InitialWeightSyncUiState.Idle,
    )
    val state: StateFlow<InitialWeightSyncUiState> = _state.asStateFlow()
    private val _manualSyncAvailability =
        MutableStateFlow<ManualSyncAvailability>(
            ManualSyncAvailability.Unconfigured,
        )
    val manualSyncAvailability: StateFlow<ManualSyncAvailability> =
        _manualSyncAvailability.asStateFlow()
    private var syncJob: Job? = null
    private var cooldownJob: Job? = null
    private var manualSyncConfiguration: ManualSyncConfiguration? = null

    fun configureManualSync(
        connectionId: String,
        cooldownMinutes: Long,
        backendLastSyncedAt: Instant?,
    ) {
        require(connectionId.isNotBlank()) {
            "A wearable connection ID is required for manual sync."
        }
        require(cooldownMinutes > 0) {
            "A positive manual-sync cooldown is required."
        }

        val configuration = ManualSyncConfiguration(
            connectionId = connectionId,
            cooldownMinutes = cooldownMinutes,
            backendLastSyncedAt = backendLastSyncedAt,
        )
        if (configuration == manualSyncConfiguration) {
            return
        }

        manualSyncConfiguration = configuration
        cooldownJob?.cancel()
        _manualSyncAvailability.value = ManualSyncAvailability.Checking
        cooldownJob = viewModelScope.launch {
            _manualSyncAvailability.value = try {
                val deviceCursor = cursorStore?.read(connectionId)
                val lastSuccessfulSyncAt = listOfNotNull(
                    deviceCursor,
                    backendLastSyncedAt,
                ).maxOrNull()
                resolveAvailability(
                    configuration = configuration,
                    lastSuccessfulSyncAt = lastSuccessfulSyncAt,
                )
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Exception) {
                ManualSyncAvailability.Unavailable
            }
        }
    }

    fun sync(connectionId: String) {
        if (syncJob?.isActive == true) {
            return
        }
        if (_manualSyncAvailability.value !== ManualSyncAvailability.Available) {
            return
        }

        _state.value = InitialWeightSyncUiState.Syncing
        syncJob = viewModelScope.launch {
            _state.value = try {
                val result = runner.sync(connectionId)
                if (
                    result.isSuccessful() &&
                    manualSyncConfiguration?.connectionId == connectionId
                ) {
                    beginCooldown(
                        configuration = requireNotNull(manualSyncConfiguration),
                        lastSuccessfulSyncAt = clock.instant(),
                    )
                }
                result.toUiState()
            } catch (exception: CancellationException) {
                throw exception
            } catch (_: Exception) {
                InitialWeightSyncUiState.Unavailable
            }
        }
    }

    fun resetForLogout() {
        syncJob?.cancel()
        cooldownJob?.cancel()
        syncJob = null
        cooldownJob = null
        manualSyncConfiguration = null
        _state.value = InitialWeightSyncUiState.Idle
        _manualSyncAvailability.value = ManualSyncAvailability.Unconfigured
    }

    private fun WeightSyncResult.toUiState(): InitialWeightSyncUiState =
        when (this) {
            is WeightSyncResult.Completed ->
                receipts.toCompletedUiState()

            WeightSyncResult.NoData -> InitialWeightSyncUiState.NoData

            is WeightSyncResult.Interrupted ->
                InitialWeightSyncUiState.Interrupted(
                    completedBatchCount = completedReceipts.size,
                    entriesImported = completedReceipts.sumOf(
                        WearableUploadReceipt::entriesImported,
                    ),
                    entriesSkipped = completedReceipts.sumOf(
                        WearableUploadReceipt::entriesSkipped,
                    ),
                    entriesUpdated = completedReceipts.sumOf(
                        WearableUploadReceipt::entriesUpdated,
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
            entriesUpdated = sumOf(WearableUploadReceipt::entriesUpdated),
        )

    private suspend fun resolveAvailability(
        configuration: ManualSyncConfiguration,
        lastSuccessfulSyncAt: Instant?,
    ): ManualSyncAvailability {
        if (lastSuccessfulSyncAt == null) {
            return ManualSyncAvailability.Available
        }

        val availableAt = lastSuccessfulSyncAt.plus(
            Duration.ofMinutes(configuration.cooldownMinutes),
        )
        val delayMillis = Duration.between(clock.instant(), availableAt).toMillis()
        if (delayMillis <= 0) {
            return ManualSyncAvailability.Available
        }

        _manualSyncAvailability.value = ManualSyncAvailability.CoolingDown(availableAt)
        delay(delayMillis)
        return if (manualSyncConfiguration == configuration) {
            ManualSyncAvailability.Available
        } else {
            _manualSyncAvailability.value
        }
    }

    private fun beginCooldown(
        configuration: ManualSyncConfiguration,
        lastSuccessfulSyncAt: Instant,
    ) {
        val availableAt = lastSuccessfulSyncAt.plus(
            Duration.ofMinutes(configuration.cooldownMinutes),
        )
        _manualSyncAvailability.value =
            ManualSyncAvailability.CoolingDown(availableAt)
        cooldownJob?.cancel()
        cooldownJob = viewModelScope.launch {
            val delayMillis = Duration.between(
                clock.instant(),
                availableAt,
            ).toMillis()
            if (delayMillis > 0) {
                delay(delayMillis)
            }
            if (manualSyncConfiguration == configuration) {
                _manualSyncAvailability.value = ManualSyncAvailability.Available
            }
        }
    }

    private fun WeightSyncResult.isSuccessful(): Boolean =
        this is WeightSyncResult.Completed || this === WeightSyncResult.NoData
}

private data class ManualSyncConfiguration(
    val connectionId: String,
    val cooldownMinutes: Long,
    val backendLastSyncedAt: Instant?,
)
