package com.viridiandome.longevity.wearables

/** Device-local boundary for Health Connect availability and weight permission. */
interface HealthConnectAccess {
    suspend fun getWeightReadAccess(): WeightReadAccess
}

/** Outcomes checked before creating or reactivating a backend connection. */
sealed interface WeightReadAccess {
    data object Granted : WeightReadAccess

    data object PermissionRequired : WeightReadAccess

    data object ProviderUpdateRequired : WeightReadAccess

    data object Unavailable : WeightReadAccess
}
