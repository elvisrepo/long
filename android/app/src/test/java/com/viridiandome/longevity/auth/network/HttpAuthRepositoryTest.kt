package com.viridiandome.longevity.auth.network

import com.viridiandome.longevity.auth.AuthTokenStore
import com.viridiandome.longevity.auth.AuthTokens
import com.viridiandome.longevity.auth.LoginResult
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.Headers.Companion.headersOf
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class HttpAuthRepositoryTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.close()
    }

    @Test
    fun successful_login_posts_django_contract_and_stores_tokens() = runTest {
        server.enqueue(
            MockResponse(
                code = 200,
                headers = headersOf("Content-Type", "application/json"),
                body = """{"access":"access-token","refresh":"refresh-token"}""",
            ),
        )
        val tokenStore = RecordingAuthTokenStore()
        val repository = HttpAuthRepository(
            client = OkHttpClient(),
            baseUrl = server.url("/").toString(),
            tokenStore = tokenStore,
        )

        val result = repository.login(
            email = "user@example.com",
            password = "secret-password",
        )

        assertSame(LoginResult.Success, result)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/auth/mobile/login/", request.url.encodedPath)
        assertEquals(
            "application/json; charset=utf-8",
            request.headers["Content-Type"],
        )
        assertEquals(
            """{"email":"user@example.com","password":"secret-password"}""",
            request.body?.utf8(),
        )
        assertEquals("access-token", tokenStore.accessToken)
        assertEquals("refresh-token", tokenStore.refreshToken)
    }

    @Test
    fun invalid_credentials_returns_safe_failure_without_storing_tokens() = runTest {
        server.enqueue(
            MockResponse(
                code = 400,
                headers = headersOf("Content-Type", "application/json"),
                body = """{"detail":"Invalid credentials."}""",
            ),
        )
        val tokenStore = RecordingAuthTokenStore()
        val repository = HttpAuthRepository(
            client = OkHttpClient(),
            baseUrl = server.url("/").toString(),
            tokenStore = tokenStore,
        )

        val result = repository.login(
            email = "user@example.com",
            password = "wrong-password",
        )

        assertTrue(result is LoginResult.Failure)
        assertEquals(
            "Invalid email or password.",
            (result as LoginResult.Failure).userMessage,
        )
        assertNull(tokenStore.accessToken)
        assertNull(tokenStore.refreshToken)
    }

    @Test
    fun unavailable_server_returns_generic_failure_without_storing_tokens() = runTest {
        val baseUrl = server.url("/").toString()
        server.close()
        val tokenStore = RecordingAuthTokenStore()
        val repository = HttpAuthRepository(
            client = OkHttpClient(),
            baseUrl = baseUrl,
            tokenStore = tokenStore,
        )

        val result = repository.login(
            email = "user@example.com",
            password = "secret-password",
        )

        assertTrue(result is LoginResult.Failure)
        assertEquals(
            "Unable to sign in. Please try again.",
            (result as LoginResult.Failure).userMessage,
        )
        assertNull(tokenStore.accessToken)
        assertNull(tokenStore.refreshToken)
    }

    @Test
    fun malformed_success_body_returns_generic_failure_without_storing_tokens() = runTest {
        server.enqueue(
            MockResponse(
                code = 200,
                headers = headersOf("Content-Type", "application/json"),
                body = """{"access":"access-token"}""",
            ),
        )
        val tokenStore = RecordingAuthTokenStore()
        val repository = HttpAuthRepository(
            client = OkHttpClient(),
            baseUrl = server.url("/").toString(),
            tokenStore = tokenStore,
        )

        val result = repository.login(
            email = "user@example.com",
            password = "secret-password",
        )

        assertTrue(result is LoginResult.Failure)
        assertEquals(
            "Unable to sign in. Please try again.",
            (result as LoginResult.Failure).userMessage,
        )
        assertNull(tokenStore.accessToken)
        assertNull(tokenStore.refreshToken)
    }

    @Test
    fun stored_tokens_restore_session_without_exposing_them() = runTest {
        val tokenStore = RecordingAuthTokenStore().apply {
            saveTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            )
        }
        val repository = HttpAuthRepository(
            client = OkHttpClient(),
            baseUrl = server.url("/").toString(),
            tokenStore = tokenStore,
        )

        assertTrue(repository.restoreSession())
    }
}

private class RecordingAuthTokenStore : AuthTokenStore {
    var accessToken: String? = null
        private set
    var refreshToken: String? = null
        private set

    override suspend fun saveTokens(
        accessToken: String,
        refreshToken: String,
    ) {
        this.accessToken = accessToken
        this.refreshToken = refreshToken
    }

    override suspend fun readTokens(): AuthTokens? {
        val access = accessToken ?: return null
        val refresh = refreshToken ?: return null
        return AuthTokens(
            accessToken = access,
            refreshToken = refresh,
        )
    }

    override suspend fun clearTokens() {
        accessToken = null
        refreshToken = null
    }
}
