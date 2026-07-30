package com.viridiandome.longevity.auth.network

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class MobileLoginResponseTest {
    @Test
    fun response_contains_tokens_without_exposing_them_in_logs() {
        val accessToken = "access-token"
        val refreshToken = "refresh-token"

        val response = MobileLoginResponse(
            access = accessToken,
            refresh = refreshToken,
        )

        // The authentication layer needs both tokens, but neither token may
        // appear if the response object is logged or attached to a crash.
        assertEquals(accessToken, response.access)
        assertEquals(refreshToken, response.refresh)
        assertFalse(response.toString().contains(accessToken))
        assertFalse(response.toString().contains(refreshToken))
    }

    @Test
    fun django_mobile_login_json_deserializes_to_response() {
        val json =
            """{"access":"access-token","refresh":"refresh-token"}"""

        // These fields match the JSON returned by Django's mobile_login_view.
        val response = Json.decodeFromString<MobileLoginResponse>(json)

        assertEquals("access-token", response.access)
        assertEquals("refresh-token", response.refresh)
    }
}
