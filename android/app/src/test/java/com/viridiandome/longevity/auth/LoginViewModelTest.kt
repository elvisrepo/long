package com.viridiandome.longevity.auth

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {
    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        // viewModelScope normally uses Android's main thread. JVM tests replace
        // it with a controllable dispatcher so no phone is required.
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

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

    @Test
    fun successful_sign_in_updates_submission_and_authentication_state() = runTest {
        val repository = ControllableAuthRepository()
        val viewModel = LoginViewModel(repository)
        viewModel.onEmailChange("user@example.com")
        viewModel.onPasswordChange("secret-password")

        viewModel.signIn()

        // Submission state changes synchronously, before the repository finishes.
        assertTrue(viewModel.state.value.isSubmitting)
        assertFalse(viewModel.state.value.canSubmit)

        runCurrent()
        assertEquals("user@example.com", repository.receivedEmail)
        assertEquals("secret-password", repository.receivedPassword)

        repository.complete(LoginResult.Success)
        advanceUntilIdle()

        val state = viewModel.state.value
        assertFalse(state.isSubmitting)
        assertTrue(state.isAuthenticated)
        assertEquals("", state.password)
        assertNull(state.errorMessage)
    }

    @Test
    fun failed_sign_in_stops_submission_and_exposes_safe_error() = runTest {
        val repository = ControllableAuthRepository()
        val viewModel = LoginViewModel(repository)
        viewModel.onEmailChange("user@example.com")
        viewModel.onPasswordChange("wrong-password")
        viewModel.signIn()
        runCurrent()

        repository.complete(
            LoginResult.Failure("Invalid email or password."),
        )
        advanceUntilIdle()

        val state = viewModel.state.value
        assertFalse(state.isSubmitting)
        assertFalse(state.isAuthenticated)
        assertEquals("Invalid email or password.", state.errorMessage)
        assertTrue(state.canSubmit)
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

private class ControllableAuthRepository : AuthRepository {
    private val result = CompletableDeferred<LoginResult>()

    var receivedEmail: String? = null
        private set
    var receivedPassword: String? = null
        private set

    override suspend fun login(
        email: String,
        password: String,
    ): LoginResult {
        receivedEmail = email
        receivedPassword = password
        return result.await()
    }

    fun complete(loginResult: LoginResult) {
        result.complete(loginResult)
    }
}
