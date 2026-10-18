package com.viridiandome.longevity.wearables.healthconnect

import android.os.RemoteException
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.response.ReadRecordsResponse
import androidx.health.connect.client.time.TimeRangeFilter
import com.viridiandome.longevity.wearables.ActivityReadPermissionRequiredException
import com.viridiandome.longevity.wearables.ActivityReadUnavailableException
import com.viridiandome.longevity.wearables.HealthConnectActivityMetric
import com.viridiandome.longevity.wearables.HealthConnectActivitySample
import java.io.IOException
import java.time.Instant
import kotlin.reflect.KClass

internal suspend fun readHealthConnectDistanceSamples(
    startTime: Instant,
    endTime: Instant,
    readPage: suspend (ReadRecordsRequest<DistanceRecord>) -> ReadRecordsResponse<DistanceRecord>,
): List<HealthConnectActivitySample> = readActivitySamples(
    startTime, endTime, DistanceRecord::class,
    readPage,
) { record ->
    HealthConnectActivitySample(
        metric = HealthConnectActivityMetric.DISTANCE, recordId = record.metadata.id,
        value = record.distance.inKilometers,
        periodStart = record.startTime, periodEnd = record.endTime,
        sourcePackageName = record.metadata.dataOrigin.packageName,
        sourceRecordModifiedAt = record.metadata.lastModifiedTime,
    )
}

internal suspend fun readHealthConnectTotalCaloriesSamples(
    startTime: Instant,
    endTime: Instant,
    readPage: suspend (ReadRecordsRequest<TotalCaloriesBurnedRecord>) -> ReadRecordsResponse<TotalCaloriesBurnedRecord>,
): List<HealthConnectActivitySample> = readActivitySamples(
    startTime, endTime, TotalCaloriesBurnedRecord::class, readPage,
) { record ->
    HealthConnectActivitySample(
        metric = HealthConnectActivityMetric.TOTAL_CALORIES, recordId = record.metadata.id,
        value = record.energy.inKilocalories,
        periodStart = record.startTime, periodEnd = record.endTime,
        sourcePackageName = record.metadata.dataOrigin.packageName,
        sourceRecordModifiedAt = record.metadata.lastModifiedTime,
    )
}

private suspend fun <T : Record> readActivitySamples(
    startTime: Instant,
    endTime: Instant,
    recordType: KClass<T>,
    readPage: suspend (ReadRecordsRequest<T>) -> ReadRecordsResponse<T>,
    mapRecord: (T) -> HealthConnectActivitySample,
): List<HealthConnectActivitySample> {
    val samples = mutableListOf<HealthConnectActivitySample>()
    var pageToken: String? = null
    do {
        val response = try {
            readPage(ReadRecordsRequest(
                recordType = recordType,
                timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                ascendingOrder = true,
                pageToken = pageToken,
            ))
        } catch (exception: SecurityException) {
            throw ActivityReadPermissionRequiredException(exception)
        } catch (exception: IOException) {
            throw ActivityReadUnavailableException(exception)
        } catch (exception: RemoteException) {
            throw ActivityReadUnavailableException(exception)
        } catch (exception: IllegalStateException) {
            throw ActivityReadUnavailableException(exception)
        }
        samples += response.records.map(mapRecord)
        pageToken = response.pageToken
    } while (pageToken != null)
    return samples
}
