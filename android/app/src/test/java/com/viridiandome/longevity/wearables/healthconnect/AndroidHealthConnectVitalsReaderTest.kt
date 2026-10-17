package com.viridiandome.longevity.wearables.healthconnect

import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.SkinTemperatureRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.response.ReadRecordsResponse
import androidx.health.connect.client.units.TemperatureDelta
import androidx.health.connect.client.units.Temperature
import com.viridiandome.longevity.wearables.WeightReadAccess
import com.viridiandome.longevity.wearables.HealthConnectInstantMetric
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class AndroidHealthConnectVitalsReaderTest {
    private val start = Instant.parse("2026-10-16T23:00:00Z")
    private val end = start.plusSeconds(3600)

    @Test fun respiratory_rate_maps_all_pages_and_preserves_identity() = runTest {
        var calls = 0
        val samples = readHealthConnectRespiratoryRateSamples(start, end) { request ->
            val token = if (calls++ == 0) "page-2" else null
            assertEquals(if (calls == 1) null else "page-2", request.pageToken)
            ReadRecordsResponse(listOf(RespiratoryRateRecord(
                time = start.plusSeconds(calls.toLong()), zoneOffset = null,
                rate = 16.5, metadata = Metadata.manualEntryWithId("resp-$calls"),
            )), token)
        }
        assertEquals(2, samples.size)
        assertEquals(HealthConnectInstantMetric.RESPIRATORY_RATE, samples.first().metric)
        assertEquals("resp-1", samples.first().recordId)
        assertEquals(16.5, samples.first().value, 0.0)
    }

    @Test fun skin_record_averages_deltas_without_inventing_an_absolute_temperature() = runTest {
        val record = SkinTemperatureRecord(
            startTime = start, startZoneOffset = null, endTime = end, endZoneOffset = null,
            deltas = listOf(
                SkinTemperatureRecord.Delta(start.plusSeconds(1), TemperatureDelta.celsius(-0.4)),
                SkinTemperatureRecord.Delta(start.plusSeconds(2), TemperatureDelta.celsius(0.0)),
            ), baseline = null, metadata = Metadata.manualEntryWithId("skin-1"),
        )
        val samples = readHealthConnectSkinTemperatureSamples(start, end) { ReadRecordsResponse(listOf(record), null) }
        assertEquals(-0.2, samples.single().value, 0.000001)
        assertEquals(HealthConnectInstantMetric.SKIN_TEMPERATURE, samples.single().metric)
        assertEquals("skin-1", samples.single().recordId)
        assertEquals(end.minusNanos(1), samples.single().recordedAt)
        assertEquals(record.metadata.lastModifiedTime, samples.single().sourceRecordModifiedAt)
    }

    @Test fun skin_permission_is_only_required_on_supported_devices() {
        val unavailable = resolveSupportedMetricReadPermissions(false)
        val available = resolveSupportedMetricReadPermissions(true)
        assertFalse(unavailable.contains("android.permission.health.READ_SKIN_TEMPERATURE"))
        assertTrue(available.contains("android.permission.health.READ_SKIN_TEMPERATURE"))
        assertTrue(unavailable.contains("android.permission.health.READ_RESPIRATORY_RATE"))
        assertEquals(WeightReadAccess.Granted, resolveSupportedMetricReadAccess(unavailable, unavailable))
        assertEquals(WeightReadAccess.PermissionRequired, resolveSupportedMetricReadAccess(unavailable, available))
    }

    @Test fun skin_baseline_is_not_added_and_empty_records_are_skipped() = runTest {
        val record = SkinTemperatureRecord(
            startTime = start, startZoneOffset = null, endTime = end, endZoneOffset = null,
            deltas = listOf(SkinTemperatureRecord.Delta(start.plusSeconds(1), TemperatureDelta.celsius(-0.3))),
            baseline = Temperature.celsius(33.0), metadata = Metadata.manualEntryWithId("with-baseline"),
        )
        val empty = SkinTemperatureRecord(
            startTime = start, startZoneOffset = null, endTime = end, endZoneOffset = null,
            deltas = emptyList(), metadata = Metadata.manualEntryWithId("empty"),
        )
        val samples = readHealthConnectSkinTemperatureSamples(start, end) { ReadRecordsResponse(listOf(record, empty), null) }
        assertEquals(1, samples.size)
        assertEquals(-0.3, samples.single().value, 0.000001)
    }
}
