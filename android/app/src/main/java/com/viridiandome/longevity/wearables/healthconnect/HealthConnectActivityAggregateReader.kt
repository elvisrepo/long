package com.viridiandome.longevity.wearables.healthconnect

import android.os.RemoteException
import com.viridiandome.longevity.wearables.ActivityReadPermissionRequiredException
import com.viridiandome.longevity.wearables.ActivityReadUnavailableException
import com.viridiandome.longevity.wearables.HealthConnectActivityMetric
import com.viridiandome.longevity.wearables.HealthConnectActivitySample
import java.io.IOException
import java.time.Instant

internal data class ActivityAggregateBucket(val startTime: Instant, val value: Double?)

/** Platform-prioritized 15-minute snapshots; missing buckets explicitly clear old totals. */
internal suspend fun readHealthConnectActivityAggregateSamples(
    metric: HealthConnectActivityMetric,
    startTime: Instant,
    endTime: Instant,
    readBuckets: suspend (HealthConnectActivityMetric, Instant, Instant) -> List<ActivityAggregateBucket>,
): List<HealthConnectActivitySample> {
    val alignedStart = Instant.ofEpochSecond(Math.floorDiv(startTime.epochSecond, 900) * 900)
    if (alignedStart >= endTime) return emptyList()
    val buckets = try {
        readBuckets(metric, alignedStart, endTime)
    } catch (exception: SecurityException) {
        throw ActivityReadPermissionRequiredException(exception)
    } catch (exception: IOException) {
        throw ActivityReadUnavailableException(exception)
    } catch (exception: RemoteException) {
        throw ActivityReadUnavailableException(exception)
    } catch (exception: IllegalStateException) {
        throw ActivityReadUnavailableException(exception)
    }
    val values = buckets.associate { it.startTime to it.value }
    val samples = mutableListOf<HealthConnectActivitySample>()
    var bucketStart = alignedStart
    while (bucketStart < endTime) {
        val bucketEnd = minOf(bucketStart.plusSeconds(900), endTime)
        val value = values[bucketStart]
        samples += HealthConnectActivitySample(
            metric = metric, recordId = "aggregate:${metric.metricSlug}:$bucketStart",
            value = value ?: 0.0, periodStart = bucketStart, periodEnd = bucketEnd,
            sourcePackageName = null, sourceRecordModifiedAt = endTime,
            isAggregate = true, hasData = value != null,
        )
        bucketStart = bucketEnd
    }
    return samples
}
