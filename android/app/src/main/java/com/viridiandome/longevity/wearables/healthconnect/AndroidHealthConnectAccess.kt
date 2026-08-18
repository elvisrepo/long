package com.viridiandome.longevity.wearables.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import com.viridiandome.longevity.wearables.BackgroundReadAccess
import com.viridiandome.longevity.wearables.HealthConnectAccess
import com.viridiandome.longevity.wearables.HealthConnectStepsReader
import com.viridiandome.longevity.wearables.HealthConnectStepsSample
import com.viridiandome.longevity.wearables.HealthConnectWeightReader
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import com.viridiandome.longevity.wearables.WeightReadAccess
import java.time.Instant

val WEIGHT_READ_PERMISSION: String =
    HealthPermission.getReadPermission(WeightRecord::class)

val STEPS_READ_PERMISSION: String =
    HealthPermission.getReadPermission(StepsRecord::class)

val SUPPORTED_METRIC_READ_PERMISSIONS: Set<String> = setOf(
    WEIGHT_READ_PERMISSION,
    STEPS_READ_PERMISSION,
)

val BACKGROUND_READ_PERMISSION: String =
    HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

val BACKGROUND_READ_PERMISSIONS: Set<String> = setOf(BACKGROUND_READ_PERMISSION)

/** Reads Health Connect SDK and permission state from the current Android device. */
class AndroidHealthConnectAccess(
    private val context: Context,
) : HealthConnectAccess, HealthConnectWeightReader, HealthConnectStepsReader {
    private val client: HealthConnectClient by lazy {
        HealthConnectClient.getOrCreate(context)
    }

    override suspend fun getWeightReadAccess(): WeightReadAccess =
        when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE -> {
                val grantedPermissions =
                    client.permissionController.getGrantedPermissions()
                resolveSupportedMetricReadAccess(grantedPermissions)
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

    override suspend fun readStepsSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectStepsSample> =
        readHealthConnectStepsSamples(
            startTime = startTime,
            endTime = endTime,
            readPage = client::readRecords,
        )
}

/** All metrics presented by the current sync UI must be readable together. */
internal fun resolveSupportedMetricReadAccess(
    grantedPermissions: Set<String>,
): WeightReadAccess =
    if (grantedPermissions.containsAll(SUPPORTED_METRIC_READ_PERMISSIONS)) {
        WeightReadAccess.Granted
    } else {
        WeightReadAccess.PermissionRequired
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
