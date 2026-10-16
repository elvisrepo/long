package com.viridiandome.longevity.wearables.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateGroupByDurationRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import com.viridiandome.longevity.wearables.HealthConnectActivityMetric
import com.viridiandome.longevity.wearables.HealthConnectActivitySample
import com.viridiandome.longevity.wearables.HealthConnectActivityReader
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import com.viridiandome.longevity.wearables.BackgroundReadAccess
import com.viridiandome.longevity.wearables.HealthConnectAccess
import com.viridiandome.longevity.wearables.HealthConnectInstantMetricReader
import com.viridiandome.longevity.wearables.HealthConnectInstantMetricSample
import com.viridiandome.longevity.wearables.HealthConnectSleepReader
import com.viridiandome.longevity.wearables.HealthConnectSleepSample
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

val SLEEP_READ_PERMISSION: String =
    HealthPermission.getReadPermission(SleepSessionRecord::class)

val RESTING_HEART_RATE_READ_PERMISSION: String =
    HealthPermission.getReadPermission(RestingHeartRateRecord::class)

val HEART_RATE_VARIABILITY_READ_PERMISSION: String =
    HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class)

val SUPPORTED_METRIC_READ_PERMISSIONS: Set<String> = setOf(
    HealthPermission.getReadPermission(DistanceRecord::class),
    HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
    WEIGHT_READ_PERMISSION,
    STEPS_READ_PERMISSION,
    SLEEP_READ_PERMISSION,
    RESTING_HEART_RATE_READ_PERMISSION,
    HEART_RATE_VARIABILITY_READ_PERMISSION,
)

val BACKGROUND_READ_PERMISSION: String =
    HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

val BACKGROUND_READ_PERMISSIONS: Set<String> = setOf(BACKGROUND_READ_PERMISSION)

/** Reads Health Connect SDK and permission state from the current Android device. */
class AndroidHealthConnectAccess(
    private val context: Context,
) : HealthConnectAccess,
    HealthConnectActivityReader,
    HealthConnectWeightReader,
    HealthConnectStepsReader,
    HealthConnectSleepReader,
    HealthConnectInstantMetricReader {
    private val client: HealthConnectClient by lazy {
        HealthConnectClient.getOrCreate(context)
    }

    override suspend fun readActivitySamples(
        metric: HealthConnectActivityMetric,
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectActivitySample> {
        val raw = when (metric) {
            HealthConnectActivityMetric.DISTANCE ->
                readHealthConnectDistanceSamples(startTime, endTime, client::readRecords)
            HealthConnectActivityMetric.TOTAL_CALORIES ->
                readHealthConnectTotalCaloriesSamples(startTime, endTime, client::readRecords)
        }
        val snapshots = readHealthConnectActivityAggregateSamples(metric, startTime, endTime) { selected, from, to ->
            val aggregateMetric = when (selected) {
                HealthConnectActivityMetric.DISTANCE -> DistanceRecord.DISTANCE_TOTAL
                HealthConnectActivityMetric.TOTAL_CALORIES -> TotalCaloriesBurnedRecord.ENERGY_TOTAL
            }
            client.aggregateGroupByDuration(AggregateGroupByDurationRequest(
                metrics = setOf(aggregateMetric),
                timeRangeFilter = TimeRangeFilter.between(from, to),
                timeRangeSlicer = Duration.ofMinutes(15),
            )).map { bucket ->
                val value = when (selected) {
                    HealthConnectActivityMetric.DISTANCE -> bucket.result[DistanceRecord.DISTANCE_TOTAL]?.inKilometers
                    HealthConnectActivityMetric.TOTAL_CALORIES -> bucket.result[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories
                }
                ActivityAggregateBucket(bucket.startTime, value)
            }
        }
        return raw + snapshots
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

    override suspend fun readSleepSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectSleepSample> =
        readHealthConnectSleepSamples(
            startTime = startTime,
            endTime = endTime,
            readPage = client::readRecords,
        )

    override suspend fun readRestingHeartRateSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectInstantMetricSample> =
        readHealthConnectRestingHeartRateSamples(
            startTime = startTime,
            endTime = endTime,
            readPage = client::readRecords,
        )

    override suspend fun readHrvSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectInstantMetricSample> =
        readHealthConnectHrvSamples(
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
