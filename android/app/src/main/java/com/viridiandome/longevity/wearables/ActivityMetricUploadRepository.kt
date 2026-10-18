package com.viridiandome.longevity.wearables

fun interface ActivityMetricUploadRepository {
    suspend fun uploadActivityBatch(
        connectionId: String,
        uploadId: String,
        samples: List<HealthConnectActivitySample>,
    ): WearableUploadResult
}
