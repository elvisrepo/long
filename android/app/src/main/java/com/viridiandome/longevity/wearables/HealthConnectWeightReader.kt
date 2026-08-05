package com.viridiandome.longevity.wearables

import java.time.Instant

/** Reads normalized weight samples from Health Connect for an explicit window. */
interface HealthConnectWeightReader {
    suspend fun readWeightSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectWeightSample>
}

/** Permission disappeared between the access check and the actual read. */
class WeightReadPermissionRequiredException(
    cause: SecurityException,
) : Exception("Health Connect weight permission is required.", cause)

/** Health Connect could not complete a permitted weight read. */
class WeightReadUnavailableException(
    cause: Throwable,
) : Exception("Health Connect weight reading is temporarily unavailable.", cause)
