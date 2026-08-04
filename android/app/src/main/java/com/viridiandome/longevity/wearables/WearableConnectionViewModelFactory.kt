package com.viridiandome.longevity.wearables

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider

/** Creates [WearableConnectionViewModel] with its repository dependency. */
class WearableConnectionViewModelFactory(
    private val repository: WearableConnectionRepository,
    private val healthConnectAccess: HealthConnectAccess,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (!modelClass.isAssignableFrom(WearableConnectionViewModel::class.java)) {
            throw IllegalArgumentException("Unsupported ViewModel: ${modelClass.name}")
        }

        @Suppress("UNCHECKED_CAST")
        return WearableConnectionViewModel(repository, healthConnectAccess) as T
    }
}
