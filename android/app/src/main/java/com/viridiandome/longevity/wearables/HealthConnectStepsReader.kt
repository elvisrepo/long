package com.viridiandome.longevity.wearables

import java.time.Instant

/** Reads normalized step intervals from Health Connect for an explicit window. */
interface HealthConnectStepsReader {
    suspend fun readStepsSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectStepsSample>
}

/** Permission disappeared between the access check and the actual read. */
class StepsReadPermissionRequiredException(
    cause: SecurityException,
) : Exception("Health Connect steps permission is required.", cause)

/** Health Connect could not complete a permitted steps read. */
class StepsReadUnavailableException(
    cause: Throwable,
) : Exception("Health Connect steps reading is temporarily unavailable.", cause)
