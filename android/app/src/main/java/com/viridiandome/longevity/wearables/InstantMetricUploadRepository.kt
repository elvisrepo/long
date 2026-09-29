package com.viridiandome.longevity.wearables

/** Upload boundary for normalized instantaneous cardiovascular samples. */
interface InstantMetricUploadRepository {
    suspend fun uploadInstantMetricBatch(
        connectionId: String,
        uploadId: String,
        samples: List<HealthConnectInstantMetricSample>,
    ): WearableUploadResult
}
