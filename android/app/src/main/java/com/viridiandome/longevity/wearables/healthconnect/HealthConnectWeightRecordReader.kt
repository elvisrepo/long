package com.viridiandome.longevity.wearables.healthconnect

import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.response.ReadRecordsResponse
import androidx.health.connect.client.time.TimeRangeFilter
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import java.time.Instant

/** SDK page-reader shape kept injectable for deterministic JVM tests. */
internal typealias WeightRecordPageReader = suspend (
    ReadRecordsRequest<WeightRecord>,
) -> ReadRecordsResponse<WeightRecord>

/** Reads and maps Health Connect SDK records without leaking SDK types upward. */
internal suspend fun readHealthConnectWeightSamples(
    startTime: Instant,
    endTime: Instant,
    readPage: WeightRecordPageReader,
): List<HealthConnectWeightSample> {
    val samples = mutableListOf<HealthConnectWeightSample>()
    var pageToken: String? = null

    do {
        val response = readPage(
            ReadRecordsRequest(
                recordType = WeightRecord::class,
                timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                ascendingOrder = true,
                pageToken = pageToken,
            ),
        )
        samples += response.records.map { record ->
            HealthConnectWeightSample(
                recordId = record.metadata.id,
                kilograms = record.weight.inKilograms,
                recordedAt = record.time,
                sourcePackageName = record.metadata.dataOrigin.packageName,
            )
        }
        pageToken = response.pageToken
    } while (pageToken != null)

    return samples
}
