package com.viridiandome.longevity.auth.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class MobileLoginRequestTest {
    @Test
    fun request_contains_credentials_without_exposing_password_in_logs() {
        val email = "user@example.com"
        val password = "secret-password"

        val request = MobileLoginRequest(
            email = email,
            password = password,
        )

        // A future JSON serializer needs access to both fields, but accidental
        // diagnostic logging must not reveal the password.
        assertEquals(email, request.email)
        assertEquals(password, request.password)
        assertFalse(request.toString().contains(password))
    }
}
