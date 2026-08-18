package com.viridiandome.longevity.wearables.network

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SyncRunResponseTest {
    @Test
    fun successful_django_sync_run_json_deserializes_to_response() {
        val json =
            """
            {
              "id": "6ac744c4-8202-4cd7-91c7-3d44ea067381",
              "connection_id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
              "upload_id": "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34",
              "status": "succeeded",
              "received_at": "2026-08-05T08:00:01Z",
              "processing_started_at": "2026-08-05T08:00:01.010000Z",
              "finished_at": "2026-08-05T08:00:01.020000Z",
              "entries_imported": 1,
              "entries_updated": 2,
              "entries_skipped": 0
            }
            """.trimIndent()

        val response = Json.decodeFromString<SyncRunResponse>(json)

        assertEquals("6ac744c4-8202-4cd7-91c7-3d44ea067381", response.id)
        assertEquals(
            "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
            response.connectionId,
        )
        assertEquals(
            "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34",
            response.uploadId,
        )
        assertEquals("succeeded", response.status)
        assertEquals("2026-08-05T08:00:01Z", response.receivedAt)
        assertEquals(
            "2026-08-05T08:00:01.010000Z",
            response.processingStartedAt,
        )
        assertEquals("2026-08-05T08:00:01.020000Z", response.finishedAt)
        assertEquals(1, response.entriesImported)
        assertEquals(2, response.entriesUpdated)
        assertEquals(0, response.entriesSkipped)
    }

    @Test
    fun received_sync_run_accepts_null_processing_timestamps() {
        val json =
            """
            {
              "id": "6ac744c4-8202-4cd7-91c7-3d44ea067381",
              "connection_id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
              "upload_id": "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34",
              "status": "received",
              "received_at": "2026-08-05T08:00:01Z",
              "processing_started_at": null,
              "finished_at": null,
              "entries_imported": 0,
              "entries_skipped": 0
            }
            """.trimIndent()

        val response = Json.decodeFromString<SyncRunResponse>(json)

        assertEquals("received", response.status)
        assertNull(response.processingStartedAt)
        assertNull(response.finishedAt)
    }
}
