package com.viridiandome.longevity.wearables.healthconnect

import android.os.RemoteException
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.response.ReadRecordsResponse
import androidx.health.connect.client.time.TimeRangeFilter
import com.viridiandome.longevity.wearables.HealthConnectSleepSample
import com.viridiandome.longevity.wearables.HealthConnectSleepStage
import com.viridiandome.longevity.wearables.SleepReadPermissionRequiredException
import com.viridiandome.longevity.wearables.SleepReadUnavailableException
import com.viridiandome.longevity.wearables.SleepStageKind
import java.io.IOException
import java.time.Instant

/** SDK page-reader shape kept injectable for deterministic JVM tests. */
internal typealias SleepRecordPageReader = suspend (
    ReadRecordsRequest<SleepSessionRecord>,
) -> ReadRecordsResponse<SleepSessionRecord>

/** Reads every SDK page and maps records without leaking SDK types upward. */
internal suspend fun readHealthConnectSleepSamples(
    startTime: Instant,
    endTime: Instant,
    readPage: SleepRecordPageReader,
): List<HealthConnectSleepSample> {
    val samples = mutableListOf<HealthConnectSleepSample>()
    var pageToken: String? = null

    do {
        val response = try {
            readPage(
                ReadRecordsRequest(
                    recordType = SleepSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(startTime, endTime),
                    ascendingOrder = true,
                    pageToken = pageToken,
                ),
            )
        } catch (exception: SecurityException) {
            throw SleepReadPermissionRequiredException(exception)
        } catch (exception: IOException) {
            throw SleepReadUnavailableException(exception)
        } catch (exception: RemoteException) {
            throw SleepReadUnavailableException(exception)
        } catch (exception: IllegalStateException) {
            throw SleepReadUnavailableException(exception)
        }

        samples += response.records.map { record ->
            HealthConnectSleepSample(
                recordId = record.metadata.id,
                periodStart = record.startTime,
                periodEnd = record.endTime,
                stages = record.stages.map { stage ->
                    HealthConnectSleepStage(
                        periodStart = stage.startTime,
                        periodEnd = stage.endTime,
                        kind = stage.stage.toSleepStageKind(),
                    )
                },
                sourcePackageName = record.metadata.dataOrigin.packageName,
                sourceRecordModifiedAt = record.metadata.lastModifiedTime,
            )
        }
        pageToken = response.pageToken
    } while (pageToken != null)

    return samples
}

private fun Int.toSleepStageKind(): SleepStageKind = when (this) {
    SleepSessionRecord.STAGE_TYPE_AWAKE -> SleepStageKind.AWAKE
    SleepSessionRecord.STAGE_TYPE_SLEEPING -> SleepStageKind.SLEEPING
    SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> SleepStageKind.OUT_OF_BED
    SleepSessionRecord.STAGE_TYPE_LIGHT -> SleepStageKind.LIGHT
    SleepSessionRecord.STAGE_TYPE_DEEP -> SleepStageKind.DEEP
    SleepSessionRecord.STAGE_TYPE_REM -> SleepStageKind.REM
    SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> SleepStageKind.AWAKE_IN_BED
    else -> SleepStageKind.UNKNOWN
}
