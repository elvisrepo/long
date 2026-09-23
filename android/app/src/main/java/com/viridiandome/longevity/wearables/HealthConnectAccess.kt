package com.viridiandome.longevity.wearables

/** Device-local boundary for required weight and optional background access. */
interface HealthConnectAccess {
    suspend fun getWeightReadAccess(): WeightReadAccess

    suspend fun getBackgroundReadAccess(): BackgroundReadAccess =
        BackgroundReadAccess.Unavailable
}

/** Outcomes checked before creating or reactivating a backend connection. */
sealed interface WeightReadAccess {
    data object Granted : WeightReadAccess

    data object PermissionRequired : WeightReadAccess

    data object ProviderUpdateRequired : WeightReadAccess

    data object Unavailable : WeightReadAccess
}

/** Background access never determines whether explicit foreground sync works. */
sealed interface BackgroundReadAccess {
    data object Granted : BackgroundReadAccess

    data object PermissionRequired : BackgroundReadAccess

    data object Unavailable : BackgroundReadAccess
}
