package com.viridiandome.longevity.wearables.sync

import com.viridiandome.longevity.wearables.*
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class ActivitySyncCoordinatorTest {
    @Test
    fun reads_any_origin_in_bounded_window_and_uploads_batches_of_100() = runTest {
        val now = Instant.parse("2026-10-16T12:00:00Z")
        val batches = mutableListOf<List<HealthConnectActivitySample>>()
        val uploads = mutableListOf<String>()
        val cursorStore = object : WeightSyncCursorStore {
            override suspend fun read(connectionId: String): Instant? {
                assertEquals("connection", connectionId)
                return null
            }
            override suspend fun write(connectionId: String, cursor: Instant) = error("Runner owns cursor")
            override suspend fun remove(connectionId: String) = Unit
        }
        val runner = ActivitySyncCoordinator(
            reader = HealthConnectActivityReader { metric, start, end ->
                assertEquals(HealthConnectActivityMetric.DISTANCE, metric)
                assertEquals(now.minusSeconds(30 * 86400), start)
                assertEquals(now, end)
                (1..101).map { index -> HealthConnectActivitySample(
                    metric, "record-$index", 0.491, now.minusSeconds(60), now,
                    "com.example.health$index", now,
                ) }
            },
            metric = HealthConnectActivityMetric.DISTANCE,
            cursorStore = cursorStore,
            uploadRepository = ActivityMetricUploadRepository { connection, uploadId, samples ->
                assertEquals("connection", connection)
                batches += samples
                uploads += uploadId
                WearableUploadResult.Success(WearableUploadReceipt(
                    id = uploadId, connectionId = connection, uploadId = uploadId,
                    status = "succeeded", receivedAt = now, processingStartedAt = now,
                    finishedAt = now, entriesImported = samples.size, entriesSkipped = 0,
                ))
            },
            clock = Clock.fixed(now, ZoneOffset.UTC),
        )
        val result = runner.sync("connection") as WeightSyncResult.Completed
        assertEquals(listOf(100, 1), batches.map { it.size })
        assertEquals(101, result.receipts.sumOf { it.entriesImported })
        assertEquals(2, uploads.toSet().size)
        assertEquals("com.example.health101", batches.last().single().sourcePackageName)
    }
}
