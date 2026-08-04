package com.viridiandome.longevity.wearables.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.WeightRecord
import com.viridiandome.longevity.wearables.HealthConnectAccess
import com.viridiandome.longevity.wearables.WeightReadAccess

val WEIGHT_READ_PERMISSION: String =
    HealthPermission.getReadPermission(WeightRecord::class)

val WEIGHT_READ_PERMISSIONS: Set<String> = setOf(WEIGHT_READ_PERMISSION)

/** Reads Health Connect SDK and permission state from the current Android device. */
class AndroidHealthConnectAccess(
    private val context: Context,
) : HealthConnectAccess {
    private val client: HealthConnectClient by lazy {
        HealthConnectClient.getOrCreate(context)
    }

    override suspend fun getWeightReadAccess(): WeightReadAccess =
        when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE -> {
                val grantedPermissions =
                    client.permissionController.getGrantedPermissions()
                if (WEIGHT_READ_PERMISSION in grantedPermissions) {
                    WeightReadAccess.Granted
                } else {
                    WeightReadAccess.PermissionRequired
                }
            }

            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
                WeightReadAccess.ProviderUpdateRequired

            else -> WeightReadAccess.Unavailable
        }
}
