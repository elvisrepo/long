package com.viridiandome.longevity.wearables

import java.time.Instant

fun interface HealthConnectActivityReader {
    suspend fun readActivitySamples(
        metric: HealthConnectActivityMetric,
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectActivitySample>
}

class ActivityReadPermissionRequiredException(cause: SecurityException) :
    Exception("Health Connect activity permissions are required.", cause)

class ActivityReadUnavailableException(cause: Throwable) :
    Exception("Health Connect activity reading is unavailable.", cause)
