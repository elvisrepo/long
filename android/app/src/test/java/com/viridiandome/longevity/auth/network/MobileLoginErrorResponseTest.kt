package com.viridiandome.longevity.auth.network

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class MobileLoginErrorResponseTest {
    @Test
    fun invalid_credentials_json_maps_to_safe_user_message() {
        val json = """{"detail":"Invalid credentials."}"""

        val response = Json.decodeFromString<MobileLoginErrorResponse>(json)

        assertEquals("Invalid credentials.", response.detail)
        assertEquals("Invalid email or password.", response.userMessage)
    }

    @Test
    fun required_field_errors_map_to_safe_user_message() {
        val json =
            """
            {
              "email":["This field is required."],
              "password":["This field is required."]
            }
            """.trimIndent()

        val response = Json.decodeFromString<MobileLoginErrorResponse>(json)

        assertEquals(listOf("This field is required."), response.email)
        assertEquals(listOf("This field is required."), response.password)
        assertEquals("Enter your email and password.", response.userMessage)
    }

    @Test
    fun individual_field_errors_identify_the_missing_input() {
        val missingEmail =
            Json.decodeFromString<MobileLoginErrorResponse>(
                """{"email":["This field is required."]}""",
            )
        val missingPassword =
            Json.decodeFromString<MobileLoginErrorResponse>(
                """{"password":["This field is required."]}""",
            )

        assertEquals("Enter your email.", missingEmail.userMessage)
        assertEquals("Enter your password.", missingPassword.userMessage)
    }

    @Test
    fun unexpected_server_detail_uses_generic_message() {
        val response =
            Json.decodeFromString<MobileLoginErrorResponse>(
                """{"detail":"Internal authentication implementation failed."}""",
            )

        assertEquals("Unable to sign in. Please try again.", response.userMessage)
    }
}
