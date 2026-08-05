package com.viridiandome.longevity.wearables

import java.time.Instant

/** Reads normalized weight samples from Health Connect for an explicit window. */
interface HealthConnectWeightReader {
    suspend fun readWeightSamples(
        startTime: Instant,
        endTime: Instant,
    ): List<HealthConnectWeightSample>
}
