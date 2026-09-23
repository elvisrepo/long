package com.viridiandome.longevity.wearables.healthconnect

import android.os.RemoteException
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.response.ReadRecordsResponse
import androidx.health.connect.client.time.TimeRangeFilter
import com.viridiandome.longevity.wearables.HealthConnectStepsSample
import com.viridiandome.longevity.wearables.StepsReadPermissionRequiredException
import com.viridiandome.longevity.wearables.StepsReadUnavailableException
import java.io.IOException
import java.time.Instant

/** SDK page-reader shape kept injectable for deterministic JVM tests. */
internal typealias StepsRecordPageReader = suspend (
    ReadRecordsRequest<StepsRecord>,
) -> ReadRecordsResponse<StepsRecord>

/** Reads every SDK page and maps records without leaking SDK types upward. */
internal suspend fun readHealthConnectStepsSamples(
    startTime: Instant,
    endTime: Instant,
    readPage: StepsRecordPageReader,
): List<HealthConnectStepsSample> {
    val samples = mutableListOf<HealthConnectStepsSample>()
    var pageToken: String? = null

    do {
        val response = try {
            readPage(
                ReadRecordsRequest(
                    recordType = StepsRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                    ascendingOrder = true,
                    pageToken = pageToken,
                ),
            )
        } catch (exception: SecurityException) {
            throw StepsReadPermissionRequiredException(exception)
        } catch (exception: IOException) {
            throw StepsReadUnavailableException(exception)
        } catch (exception: RemoteException) {
            throw StepsReadUnavailableException(exception)
        } catch (exception: IllegalStateException) {
            throw StepsReadUnavailableException(exception)
        }

        samples += response.records.map { record ->
            HealthConnectStepsSample(
                recordId = record.metadata.id,
                count = record.count,
                periodStart = record.startTime,
                periodEnd = record.endTime,
                sourcePackageName = record.metadata.dataOrigin.packageName,
                sourceRecordModifiedAt = record.metadata.lastModifiedTime,
            )
        }
        pageToken = response.pageToken
    } while (pageToken != null)

    return samples
}
