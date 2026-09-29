package com.viridiandome.longevity.wearables.healthconnect

import android.os.RemoteException
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.response.ReadRecordsResponse
import androidx.health.connect.client.time.TimeRangeFilter
import com.viridiandome.longevity.wearables.HealthConnectInstantMetric
import com.viridiandome.longevity.wearables.HealthConnectInstantMetricSample
import com.viridiandome.longevity.wearables.InstantMetricReadPermissionRequiredException
import com.viridiandome.longevity.wearables.InstantMetricReadUnavailableException
import java.io.IOException
import java.time.Instant
import kotlin.reflect.KClass

internal typealias RestingHeartRateRecordPageReader = suspend (
    ReadRecordsRequest<RestingHeartRateRecord>,
) -> ReadRecordsResponse<RestingHeartRateRecord>

internal typealias HrvRecordPageReader = suspend (
    ReadRecordsRequest<HeartRateVariabilityRmssdRecord>,
) -> ReadRecordsResponse<HeartRateVariabilityRmssdRecord>

internal suspend fun readHealthConnectRestingHeartRateSamples(
    startTime: Instant,
    endTime: Instant,
    readPage: RestingHeartRateRecordPageReader,
): List<HealthConnectInstantMetricSample> = readInstantMetricSamples(
    startTime = startTime,
    endTime = endTime,
    recordType = RestingHeartRateRecord::class,
    readPage = readPage,
) { record ->
    HealthConnectInstantMetricSample(
        metric = HealthConnectInstantMetric.RESTING_HEART_RATE,
        recordId = record.metadata.id,
        value = record.beatsPerMinute.toDouble(),
        recordedAt = record.time,
        sourcePackageName = record.metadata.dataOrigin.packageName,
        sourceRecordModifiedAt = record.metadata.lastModifiedTime,
    )
}

internal suspend fun readHealthConnectHrvSamples(
    startTime: Instant,
    endTime: Instant,
    readPage: HrvRecordPageReader,
): List<HealthConnectInstantMetricSample> = readInstantMetricSamples(
    startTime = startTime,
    endTime = endTime,
    recordType = HeartRateVariabilityRmssdRecord::class,
    readPage = readPage,
) { record ->
    HealthConnectInstantMetricSample(
        metric = HealthConnectInstantMetric.HRV_RMSSD,
        recordId = record.metadata.id,
        value = record.heartRateVariabilityMillis,
        recordedAt = record.time,
        sourcePackageName = record.metadata.dataOrigin.packageName,
        sourceRecordModifiedAt = record.metadata.lastModifiedTime,
    )
}

private suspend fun <RecordType : Record> readInstantMetricSamples(
    startTime: Instant,
    endTime: Instant,
    recordType: KClass<RecordType>,
    readPage: suspend (
        ReadRecordsRequest<RecordType>,
    ) -> ReadRecordsResponse<RecordType>,
    mapRecord: (RecordType) -> HealthConnectInstantMetricSample,
): List<HealthConnectInstantMetricSample> {
    val samples = mutableListOf<HealthConnectInstantMetricSample>()
    var pageToken: String? = null
    do {
        val response = try {
            readPage(
                ReadRecordsRequest(
                    recordType = recordType,
                    timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                    ascendingOrder = true,
                    pageToken = pageToken,
                ),
            )
        } catch (exception: SecurityException) {
            throw InstantMetricReadPermissionRequiredException(exception)
        } catch (exception: IOException) {
            throw InstantMetricReadUnavailableException(exception)
        } catch (exception: RemoteException) {
            throw InstantMetricReadUnavailableException(exception)
        } catch (exception: IllegalStateException) {
            throw InstantMetricReadUnavailableException(exception)
        }
        samples += response.records.map(mapRecord)
        pageToken = response.pageToken
    } while (pageToken != null)
    return samples
}
