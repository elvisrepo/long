package com.viridiandome.longevity.wearables.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.WeightRecord
import com.viridiandome.longevity.wearables.BackgroundReadAccess
import com.viridiandome.longevity.wearables.HealthConnectAccess
import com.viridiandome.longevity.wearables.HealthConnectWeightReader
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import com.viridiandome.longevity.wearables.WeightReadAccess
import java.time.Instant

val WEIGHT_READ_PERMISSION: String =
    HealthPermission.getReadPermission(WeightRecord::class)

val WEIGHT_READ_PERMISSIONS: Set<String> = setOf(WEIGHT_READ_PERMISSION)

val BACKGROUND_READ_PERMISSION: String =
    HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

val BACKGROUND_READ_PERMISSIONS: Set<String> = setOf(BACKGROUND_READ_PERMISSION)

/** Reads Health Connect SDK and permission state from the current Android device. */
class AndroidHealthConnectAccess(
    private val context: Context,
) : HealthConnectAccess, HealthConnectWeightReader {
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

    override suspend fun getBackgroundReadAccess(): BackgroundReadAccess {
        if (
            HealthConnectClient.getSdkStatus(context) !=
            HealthConnectClient.SDK_AVAILABLE
        ) {
            return BackgroundReadAccess.Unavailable
        }

        return resolveBackgroundReadAccess(
            featureStatus = client.features.getFeatureStatus(
                HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND,
            ),
            grantedPermissions = client.permissionController.getGrantedPermissions(),
        )
    }

    override suspend fun readWeightSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectWeightSample> =
        readHealthConnectWeightSamples(
            startTime = startTime,
            endTime = endTime,
            readPage = client::readRecords,
        )
}

/** Maps SDK feature/permission values into an SDK-independent domain result. */
internal fun resolveBackgroundReadAccess(
    featureStatus: Int,
    grantedPermissions: Set<String>,
): BackgroundReadAccess {
    if (featureStatus != HealthConnectFeatures.FEATURE_STATUS_AVAILABLE) {
        return BackgroundReadAccess.Unavailable
    }

    return if (BACKGROUND_READ_PERMISSION in grantedPermissions) {
        BackgroundReadAccess.Granted
    } else {
        BackgroundReadAccess.PermissionRequired
    }
}
