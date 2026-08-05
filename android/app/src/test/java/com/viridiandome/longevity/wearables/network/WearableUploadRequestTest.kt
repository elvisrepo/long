package com.viridiandome.longevity.wearables.network

import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.time.Instant

class WearableUploadRequestTest {
    @Test
    fun weight_sample_serializes_to_django_upload_contract() {
        val sample = HealthConnectWeightSample(
            recordId = "record-123",
            kilograms = 78.4,
            recordedAt = Instant.parse("2026-08-05T08:00:00Z"),
            sourcePackageName = "com.sec.android.app.shealth",
        )
        val request = WearableUploadRequest(
            connectionId = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
            uploadId = "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34",
            entries = listOf(WearableUploadEntryRequest.from(sample)),
        )

        val actual = Json.parseToJsonElement(
            Json.encodeToString(request),
        ).jsonObject
        val expected = Json.parseToJsonElement(
            """
            {
              "connection_id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
              "upload_id": "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34",
              "entries": [
                {
                  "metric_definition": "body_weight",
                  "value": 78.4,
                  "recorded_at": "2026-08-05T08:00:00Z",
                  "source": "samsung_health",
                  "external_source_id": "health_connect:WeightRecord:record-123"
                }
              ]
            }
            """.trimIndent(),
        ).jsonObject

        assertEquals(expected, actual)
    }

    @Test
    fun upload_diagnostics_do_not_expose_health_record_values() {
        val sample = HealthConnectWeightSample(
            recordId = "private-record-123",
            kilograms = 78.4,
            recordedAt = Instant.parse("2026-08-05T08:00:00Z"),
            sourcePackageName = "com.sec.android.app.shealth",
        )
        val entry = WearableUploadEntryRequest.from(sample)
        val request = WearableUploadRequest(
            connectionId = "connection-id",
            uploadId = "upload-id",
            entries = listOf(entry),
        )

        listOf(entry.toString(), request.toString()).forEach { diagnostic ->
            assertFalse(diagnostic.contains("78.4"))
            assertFalse(diagnostic.contains("2026-08-05T08:00:00Z"))
            assertFalse(diagnostic.contains("private-record-123"))
        }
    }
}
