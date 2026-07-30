package com.viridiandome.longevity.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class LoginViewModelTest {
    @Test
    fun credential_changes_update_redacted_ui_state() {
        val viewModel = LoginViewModel(NeverCalledAuthRepository())

        viewModel.onEmailChange("user@example.com")
        viewModel.onPasswordChange("secret-password")

        val state = viewModel.state.value
        assertEquals("user@example.com", state.email)
        assertEquals("secret-password", state.password)
        assertFalse(state.toString().contains("user@example.com"))
        assertFalse(state.toString().contains("secret-password"))
    }
}

/**
 * This first ViewModel behavior does not submit credentials. If the repository
 * is called accidentally, the test fails immediately.
 */
private class NeverCalledAuthRepository : AuthRepository {
    override suspend fun login(
        email: String,
        password: String,
    ): LoginResult = error("Repository must not be called while editing credentials.")
}
