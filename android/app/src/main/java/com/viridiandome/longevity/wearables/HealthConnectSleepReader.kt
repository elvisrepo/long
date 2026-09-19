package com.viridiandome.longevity.wearables

import java.time.Instant

/** Reads normalized sleep sessions from Health Connect for an explicit window. */
interface HealthConnectSleepReader {
    suspend fun readSleepSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectSleepSample>
}

/** Permission disappeared between the access check and the actual read. */
class SleepReadPermissionRequiredException(
    cause: SecurityException,
) : Exception("Health Connect sleep permission is required.", cause)

/** Health Connect could not complete a permitted sleep read. */
class SleepReadUnavailableException(
    cause: Throwable,
) : Exception("Health Connect sleep reading is temporarily unavailable.", cause)
