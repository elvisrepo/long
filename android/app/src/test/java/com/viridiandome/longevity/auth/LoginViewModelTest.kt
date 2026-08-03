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

    @Test
    fun stored_session_restores_authenticated_state() = runTest {
        val repository = StoredSessionAuthRepository()
        val viewModel = LoginViewModel(repository)

        advanceUntilIdle()

        assertEquals(1, repository.restoreRequests)
        assertTrue(viewModel.state.value.isAuthenticated)
    }

    @Test
    fun session_checking_remains_visible_until_restoration_finishes() = runTest {
        val repository = ControllableSessionRestoreAuthRepository()
        val viewModel = LoginViewModel(repository)

        assertTrue(viewModel.state.value.isCheckingSession)
        runCurrent()
        assertTrue(viewModel.state.value.isCheckingSession)

        repository.complete(hasStoredSession = false)
        advanceUntilIdle()

        assertFalse(viewModel.state.value.isCheckingSession)
        assertFalse(viewModel.state.value.isAuthenticated)
    }

    @Test
    fun successful_logout_returns_to_blank_login_state() = runTest {
        val repository = LogoutAuthRepository()
        val viewModel = LoginViewModel(repository)
        advanceUntilIdle()
        assertTrue(viewModel.state.value.isAuthenticated)

        viewModel.logout()
        advanceUntilIdle()

        assertEquals(1, repository.logoutRequests)
        val state = viewModel.state.value
        assertFalse(state.isAuthenticated)
        assertEquals("", state.email)
        assertEquals("", state.password)
        assertNull(state.errorMessage)
    }

    @Test
    fun failed_logout_keeps_authenticated_state_and_shows_safe_error() = runTest {
        val repository = LogoutAuthRepository(logoutSucceeds = false)
        val viewModel = LoginViewModel(repository)
        advanceUntilIdle()

        viewModel.logout()
        advanceUntilIdle()

        val state = viewModel.state.value
        assertTrue(state.isAuthenticated)
        assertFalse(state.isLoggingOut)
        assertEquals("Unable to log out. Please try again.", state.errorMessage)
    }
}

/**
 * This first ViewModel behavior does not submit credentials. If the repository
 * is called accidentally, the test fails immediately.
 */
private class NeverCalledAuthRepository : AuthRepository {
    override suspend fun restoreSession(): Boolean = false

    override suspend fun login(
        email: String,
        password: String,
    ): LoginResult = error("Repository must not be called while editing credentials.")

    override suspend fun logout(): Boolean =
        error("Repository must not be called while editing credentials.")
}

private class ControllableAuthRepository : AuthRepository {
    private val result = CompletableDeferred<LoginResult>()

    var receivedEmail: String? = null
        private set
    var receivedPassword: String? = null
        private set

    override suspend fun restoreSession(): Boolean = false

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

    override suspend fun logout(): Boolean = error("Logout is not under test.")
}

private class StoredSessionAuthRepository : AuthRepository {
    var restoreRequests: Int = 0
        private set

    override suspend fun restoreSession(): Boolean {
        restoreRequests += 1
        return true
    }

    override suspend fun login(
        email: String,
        password: String,
    ): LoginResult = error("Login must not run while restoring an existing session.")

    override suspend fun logout(): Boolean = error("Logout is not under test.")
}

private class ControllableSessionRestoreAuthRepository : AuthRepository {
    private val restoreResult = CompletableDeferred<Boolean>()

    override suspend fun restoreSession(): Boolean = restoreResult.await()

    override suspend fun login(
        email: String,
        password: String,
    ): LoginResult = error("Login must not run while checking the stored session.")

    fun complete(hasStoredSession: Boolean) {
        restoreResult.complete(hasStoredSession)
    }

    override suspend fun logout(): Boolean = error("Logout is not under test.")
}

private class LogoutAuthRepository(
    private val logoutSucceeds: Boolean = true,
) : AuthRepository {
    var logoutRequests: Int = 0
        private set

    override suspend fun restoreSession(): Boolean = true

    override suspend fun login(
        email: String,
        password: String,
    ): LoginResult = error("Login must not run for an authenticated session.")

    override suspend fun logout(): Boolean {
        logoutRequests += 1
        return logoutSucceeds
    }
}
