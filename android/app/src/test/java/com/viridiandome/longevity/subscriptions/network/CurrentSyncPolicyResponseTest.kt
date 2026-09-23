package com.viridiandome.longevity.subscriptions.network

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class CurrentSyncPolicyResponseTest {
    @Test
    fun current_subscription_json_decodes_server_owned_sync_policy() {
        val response = Json { ignoreUnknownKeys = true }
            .decodeFromString<CurrentSubscriptionSyncPolicyResponse>(
                """
                {
                  "id": "53270422-14ce-458c-b3dc-69c52351a461",
                  "status": "active",
                  "billing_portal_available": false,
                  "plan": {
                    "code": "free",
                    "name": "Free",
                    "wearable_connection_limit": 1,
                    "automatic_sync_enabled": false,
                    "sync_interval_minutes": 30
                  }
                }
                """.trimIndent(),
            )

        assertFalse(response.plan.automaticSyncEnabled)
        assertEquals(30L, response.plan.syncIntervalMinutes)
    }
}
