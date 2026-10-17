package com.viridiandome.longevity.wearables

import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.test.platform.app.InstrumentationRegistry
import com.viridiandome.longevity.LongevityApplication
import com.viridiandome.longevity.wearables.healthconnect.AndroidHealthConnectAccess
import com.viridiandome.longevity.wearables.healthconnect.supportedMetricReadPermissions
import com.viridiandome.longevity.wearables.sync.WeightSyncResult
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.time.Instant
import java.util.UUID

/** Explicitly imports real phone records into its signed-in local development account. */
class VitalsDeviceTest {
    @Test fun complete_app_runner_finishes_with_new_vitals() = runBlocking {
        assumeTrue(InstrumentationRegistry.getArguments().getString("vitalsAcceptance") == "true")
        val app = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as LongevityApplication
        val connections = app.wearableConnectionRepository.getConnections()
        assertTrue("Sign in to the local debug app", connections is WearableConnectionsResult.Success)
        val connection = (connections as WearableConnectionsResult.Success).connections.first { it.provider == "health_connect" }
        Log.i("VitalsAcceptance", "full runner: starting; cursor present=${app.weightSyncCursorStore.read(connection.id) != null}")
        val result = app.incrementalWeightSyncRunner.sync(connection.id)
        when (result) {
            is WeightSyncResult.Completed -> Log.i("VitalsAcceptance", "full runner completed: ${result.receipts.size} batches")
            is WeightSyncResult.Interrupted -> Log.i("VitalsAcceptance", "full runner interrupted: ${result.failure}; ${result.completedReceipts.size} completed batches")
            WeightSyncResult.NoData -> Log.i("VitalsAcceptance", "full runner: no data")
        }
        assertFalse("Full runner must finish: $result", result is WeightSyncResult.Interrupted)
    }

    @Test fun reads_uploads_and_replays_real_vitals() = runBlocking {
        assumeTrue(InstrumentationRegistry.getArguments().getString("vitalsAcceptance") == "true")
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val app = context.applicationContext as LongevityApplication
        val client = HealthConnectClient.getOrCreate(context)
        assertTrue("Grant the app's Health Connect read permissions first",
            client.permissionController.getGrantedPermissions().containsAll(supportedMetricReadPermissions(context)))
        val connections = app.wearableConnectionRepository.getConnections()
        assertTrue("Sign in to the local debug app", connections is WearableConnectionsResult.Success)
        val connection = (connections as WearableConnectionsResult.Success).connections.first { it.provider == "health_connect" }
        val reader = AndroidHealthConnectAccess(context)
        val end = Instant.now()
        val start = end.minusSeconds(30L * 86400)
        val batches = listOf(reader.readRespiratoryRateSamples(start, end), reader.readSkinTemperatureSamples(start, end))
        for ((index, samples) in batches.withIndex()) {
            val slug = if (index == 0) "respiratory_rate" else "skin_temperature"
            samples.forEach { assertTrue(it.value.isFinite()); assertTrue(it.sourcePackageName.isNotBlank()) }
            for (batch in samples.chunked(100)) {
                val first = app.wearableUploadRepository.uploadInstantMetricBatch(connection.id, UUID.randomUUID().toString(), batch)
                assertTrue("Vital upload must succeed", first is WearableUploadResult.Success)
                val replay = app.wearableUploadRepository.uploadInstantMetricBatch(connection.id, UUID.randomUUID().toString(), batch)
                assertTrue(replay is WearableUploadResult.Success)
                val receipt = (replay as WearableUploadResult.Success).receipt
                assertEquals(0, receipt.entriesImported)
                assertEquals(0, receipt.entriesUpdated)
                assertEquals(batch.size, receipt.entriesSkipped)
            }
            Log.i("VitalsAcceptance", "$slug: ${samples.size} real records; upload/replay checked when nonempty")
        }
    }
}
