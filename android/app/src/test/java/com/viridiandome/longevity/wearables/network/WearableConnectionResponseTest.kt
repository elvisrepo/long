package com.viridiandome.longevity.wearables.network

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WearableConnectionResponseTest {
    @Test
    fun django_wearable_connection_json_deserializes_to_response() {
        val json =
            """
            {
              "id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
              "provider": "health_connect",
              "status": "pending",
              "last_synced_at": null,
              "last_error": "",
              "created_at": "2026-08-04T10:00:00Z",
              "updated_at": "2026-08-04T10:00:00Z"
            }
            """.trimIndent()

        // This is the exact object returned by Django for GET/POST connection calls.
        val response = Json.decodeFromString<WearableConnectionResponse>(json)

        assertEquals(
            "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
            response.id,
        )
        assertEquals("health_connect", response.provider)
        assertEquals("pending", response.status)
        assertNull(response.lastSyncedAt)
        assertEquals("", response.lastError)
        assertEquals("2026-08-04T10:00:00Z", response.createdAt)
        assertEquals("2026-08-04T10:00:00Z", response.updatedAt)
    }
}
