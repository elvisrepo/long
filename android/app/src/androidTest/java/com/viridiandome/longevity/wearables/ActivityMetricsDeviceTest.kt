package com.viridiandome.longevity.wearables

import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.viridiandome.longevity.auth.network.AuthenticatedApiResult
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.double
import okhttp3.Request
import okhttp3.HttpUrl.Companion.toHttpUrl
import androidx.test.platform.app.InstrumentationRegistry
import com.viridiandome.longevity.BuildConfig
import com.viridiandome.longevity.LongevityApplication
import com.viridiandome.longevity.wearables.healthconnect.AndroidHealthConnectAccess
import com.viridiandome.longevity.wearables.sync.ActivitySyncCoordinator
import com.viridiandome.longevity.wearables.sync.WeightSyncResult
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.net.HttpURLConnection
import java.net.URI
import java.time.Instant

/** Opt-in physical-device acceptance: never inserts or deletes Health Connect data. */
class ActivityMetricsDeviceTest {
    private fun requireExplicitAcceptanceRun() {
        assumeTrue("Run with -e activityMetricsAcceptance true on a development phone",
            InstrumentationRegistry.getArguments().getString("activityMetricsAcceptance") == "true")
    }

    @Test
    fun uploads_activity_to_the_signed_in_local_account_and_replays_without_duplicates() = runBlocking {
        requireExplicitAcceptanceRun()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val app = context.applicationContext as LongevityApplication
        val result = app.wearableConnectionRepository.getConnections()
        assertTrue("Sign in to the local debug app before this opt-in test",
            result is WearableConnectionsResult.Success)
        val connection = (result as WearableConnectionsResult.Success).connections
            .firstOrNull { it.provider == "health_connect" }
        assertNotNull("Connect Health Connect before this opt-in test", connection)
        val clock = java.time.Clock.fixed(Instant.now(), java.time.ZoneOffset.UTC)
        for (metric in HealthConnectActivityMetric.entries) {
            val coordinator = ActivitySyncCoordinator(
                reader = AndroidHealthConnectAccess(context), metric = metric,
                cursorStore = app.weightSyncCursorStore,
                uploadRepository = app.wearableUploadRepository, clock = clock,
            )
            val first = coordinator.sync(connection!!.id)
            assertTrue("Activity upload must complete", first is WeightSyncResult.Completed)
            val replay = coordinator.sync(connection.id)
            assertTrue("Activity replay must complete", replay is WeightSyncResult.Completed)
            val receipts = (replay as WeightSyncResult.Completed).receipts
            assertEquals(0, receipts.sumOf { it.entriesImported })
            assertEquals(0, receipts.sumOf { it.entriesUpdated })
            assertTrue(receipts.sumOf { it.entriesSkipped } > 0)
            Log.i("ActivityMetricsAcceptance",
                "${metric.metricSlug}: upload completed; replay skipped ${receipts.sumOf { it.entriesSkipped }} records")
            val zone = java.time.ZoneId.systemDefault()
            val yesterday = java.time.LocalDate.now(zone).minusDays(1)
            val from = yesterday.atStartOfDay(zone).toInstant()
            val to = yesterday.plusDays(1).atStartOfDay(zone).toInstant()
            val sdkMetric = when (metric) {
                HealthConnectActivityMetric.DISTANCE -> DistanceRecord.DISTANCE_TOTAL
                HealthConnectActivityMetric.TOTAL_CALORIES -> TotalCaloriesBurnedRecord.ENERGY_TOTAL
            }
            val platform = HealthConnectClient.getOrCreate(context).aggregate(AggregateRequest(
                metrics = setOf(sdkMetric), timeRangeFilter = TimeRangeFilter.between(from, to),
            ))
            val expected = when (metric) {
                HealthConnectActivityMetric.DISTANCE -> platform[DistanceRecord.DISTANCE_TOTAL]?.inKilometers
                HealthConnectActivityMetric.TOTAL_CALORIES -> platform[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories
            }
            val endpoint = when (metric) {
                HealthConnectActivityMetric.DISTANCE -> "daily-distance"
                HealthConnectActivityMetric.TOTAL_CALORIES -> "daily-total-calories"
            }
            val url = (BuildConfig.API_BASE_URL + "api/v1/metrics/entries/$endpoint/").toHttpUrl()
                .newBuilder().addQueryParameter("timezone", zone.id)
                .addQueryParameter("from", yesterday.toString())
                .addQueryParameter("to", yesterday.toString()).build()
            val response = app.authenticatedApiClient.execute(Request.Builder().url(url).build())
            assertTrue("Daily API must respond", response is AuthenticatedApiResult.Response)
            response as AuthenticatedApiResult.Response
            assertEquals(200, response.statusCode)
            val rows = Json.parseToJsonElement(response.body).jsonArray
            if (expected == null) {
                assertTrue(rows.isEmpty())
            } else {
                assertEquals(1, rows.size)
                val actual = rows.single().jsonObject["value"]!!.jsonPrimitive.double
                assertEquals("Daily total must match independent Health Connect aggregate", expected, actual, 0.000001)
            }
            Log.i("ActivityMetricsAcceptance", "${metric.metricSlug}: daily API matches independent Health Connect aggregate")
        }
    }

    @Test
    fun local_backend_is_reachable_from_the_phone() {
        requireExplicitAcceptanceRun()
        val connection = URI(BuildConfig.API_BASE_URL + "api/v1/health/ready/")
            .toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            assertEquals(200, connection.responseCode)
        } finally {
            connection.disconnect()
        }
    }

    @Test
    fun reads_permitted_activity_records_with_units_intervals_and_origins() = runBlocking {
        requireExplicitAcceptanceRun()
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        assumeTrue(HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE)
        val permissions = HealthConnectClient.getOrCreate(context)
            .permissionController.getGrantedPermissions()
        assumeTrue("Grant Distance and Total Calories read access before this test",
            permissions.containsAll(setOf(
                HealthPermission.getReadPermission(DistanceRecord::class),
                HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
            )))
        val reader = AndroidHealthConnectAccess(context)
        val end = Instant.now()
        for (metric in HealthConnectActivityMetric.entries) {
            val samples = reader.readActivitySamples(metric, end.minusSeconds(86400), end)
            for (sample in samples) {
                assertEquals(metric, sample.metric)
                assertTrue(sample.value.isFinite() && sample.value >= 0)
                assertTrue(sample.periodStart < sample.periodEnd)
                assertTrue(sample.recordId.isNotBlank())
                if (sample.isAggregate) assertNull(sample.sourcePackageName)
                else assertTrue(sample.sourcePackageName!!.isNotBlank())
            }
            Log.i("ActivityMetricsAcceptance", "${metric.metricSlug}: ${samples.size} records read")
        }
    }
}
