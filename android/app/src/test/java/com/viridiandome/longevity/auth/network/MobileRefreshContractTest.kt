package com.viridiandome.longevity.auth.network

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class MobileRefreshContractTest {
    @Test
    fun request_serializes_django_contract_without_exposing_refresh_token() {
        val refreshToken = "stored-refresh-token"
        val request = MobileRefreshRequest(refresh = refreshToken)

        assertEquals(
            """{"refresh":"stored-refresh-token"}""",
            Json.encodeToString(request),
        )
        assertFalse(request.toString().contains(refreshToken))
    }

    @Test
    fun response_decodes_required_access_with_optional_rotated_refresh() {
        val accessToken = "new-access-token"

        val response = Json.decodeFromString<MobileRefreshResponse>(
            """{"access":"new-access-token"}""",
        )

        assertEquals(accessToken, response.access)
        assertEquals(null, response.refresh)
        assertFalse(response.toString().contains(accessToken))
    }

    @Test
    fun response_decodes_rotated_refresh_without_exposing_either_token() {
        val accessToken = "new-access-token"
        val rotatedRefreshToken = "rotated-refresh-token"

        val response = Json.decodeFromString<MobileRefreshResponse>(
            """{"access":"new-access-token","refresh":"rotated-refresh-token"}""",
        )

        assertEquals(accessToken, response.access)
        assertEquals(rotatedRefreshToken, response.refresh)
        assertFalse(response.toString().contains(accessToken))
        assertFalse(response.toString().contains(rotatedRefreshToken))
    }
}
