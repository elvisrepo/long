package com.viridiandome.longevity.wearables.sync

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider

/** Creates [InitialWeightSyncViewModel] with its application-level runner. */
class InitialWeightSyncViewModelFactory(
    private val runner: InitialWeightSyncRunner,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (!modelClass.isAssignableFrom(InitialWeightSyncViewModel::class.java)) {
            throw IllegalArgumentException("Unsupported ViewModel: ${modelClass.name}")
        }

        @Suppress("UNCHECKED_CAST")
        return InitialWeightSyncViewModel(runner) as T
    }
}
