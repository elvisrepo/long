package com.viridiandome.longevity.wearables

import java.time.Instant

interface HealthConnectInstantMetricReader {
    suspend fun readRestingHeartRateSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectInstantMetricSample>

    suspend fun readHrvSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectInstantMetricSample>
}

class InstantMetricReadPermissionRequiredException(
    cause: SecurityException,
) : Exception("Health Connect cardiovascular permissions are required.", cause)

class InstantMetricReadUnavailableException(
    cause: Throwable,
) : Exception("Health Connect cardiovascular reading is unavailable.", cause)
