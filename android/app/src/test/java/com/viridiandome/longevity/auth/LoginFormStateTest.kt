package com.viridiandome.longevity.auth

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LoginFormStateTest {
    @Test
    fun submit_is_disabled_when_credentials_are_blank() {
        val state = LoginFormState(
            email = "",
            password = "",
        )

        assertFalse(state.canSubmit)
    }

    @Test
    fun submit_is_enabled_when_credentials_are_present() {
        val state = LoginFormState(
            email = "user@example.com",
            password = "secret-password",
        )

        assertTrue(state.canSubmit)
    }

    @Test
    fun state_string_does_not_expose_password() {
        val password = "secret-password"
        val state = LoginFormState(
            email = "user@example.com",
            password = password,
        )

        // Data classes generate toString(), so guard against accidental
        // password disclosure through logs or crash diagnostics.
        assertFalse(state.toString().contains(password))
    }
}
