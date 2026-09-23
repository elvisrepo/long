package com.viridiandome.longevity.auth.network

import com.viridiandome.longevity.auth.AuthTokenStore
import com.viridiandome.longevity.auth.AuthTokens
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AuthenticatedApiClientTest {
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
    fun request_uses_stored_access_token_as_bearer_credential() = runTest {
        server.enqueue(MockResponse(code = 200, body = "[]"))
        val tokenStore = TestAuthTokenStore(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )
        val client = AuthenticatedApiClient(
            client = OkHttpClient(),
            tokenStore = tokenStore,
            sessionRefresher = NeverRefreshSessionRefresher(),
        )

        val result = client.execute(
            Request.Builder()
                .url(server.url("/api/v1/wearables/connections/"))
                .get()
                .build(),
        )

        assertTrue(result is AuthenticatedApiResult.Response)
        result as AuthenticatedApiResult.Response
        assertEquals(200, result.statusCode)
        assertEquals("[]", result.body)
        assertEquals(
            "Bearer stored-access-token",
            server.takeRequest().headers["Authorization"],
        )
    }

    @Test
    fun unauthorized_request_refreshes_and_retries_once_with_new_access_token() = runTest {
        server.enqueue(MockResponse(code = 401))
        server.enqueue(MockResponse(code = 200, body = "[]"))
        val tokenStore = TestAuthTokenStore(
            tokens = AuthTokens(
                accessToken = "expired-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )
        val sessionRefresher = RecordingSessionRefresher(tokenStore)
        val client = AuthenticatedApiClient(
            client = OkHttpClient(),
            tokenStore = tokenStore,
            sessionRefresher = sessionRefresher,
        )

        val result = client.execute(
            Request.Builder()
                .url(server.url("/api/v1/wearables/connections/"))
                .get()
                .build(),
        )

        assertTrue(result is AuthenticatedApiResult.Response)
        result as AuthenticatedApiResult.Response
        assertEquals(200, result.statusCode)
        assertEquals(1, sessionRefresher.refreshRequests)
        assertEquals(
            "Bearer expired-access-token",
            server.takeRequest().headers["Authorization"],
        )
        assertEquals(
            "Bearer refreshed-access-token",
            server.takeRequest().headers["Authorization"],
        )
    }

    @Test
    fun missing_session_skips_product_request() = runTest {
        val client = AuthenticatedApiClient(
            client = OkHttpClient(),
            tokenStore = TestAuthTokenStore(tokens = null),
            sessionRefresher = NeverRefreshSessionRefresher(),
        )

        val result = client.execute(
            Request.Builder()
                .url(server.url("/api/v1/wearables/connections/"))
                .get()
                .build(),
        )

        assertSame(AuthenticatedApiResult.NoSession, result)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun rejected_refresh_returns_no_session_without_retrying_product_request() = runTest {
        server.enqueue(MockResponse(code = 401))
        val tokenStore = TestAuthTokenStore(
            tokens = AuthTokens(
                accessToken = "expired-access-token",
                refreshToken = "rejected-refresh-token",
            ),
        )
        val sessionRefresher = RejectedSessionRefresher(tokenStore)
        val client = AuthenticatedApiClient(
            client = OkHttpClient(),
            tokenStore = tokenStore,
            sessionRefresher = sessionRefresher,
        )

        val result = client.execute(
            Request.Builder()
                .url(server.url("/api/v1/wearables/connections/"))
                .get()
                .build(),
        )

        assertSame(AuthenticatedApiResult.NoSession, result)
        assertEquals(1, sessionRefresher.refreshRequests)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun already_refreshed_token_is_reused_without_rotating_again() = runTest {
        server.enqueue(MockResponse(code = 401))
        server.enqueue(MockResponse(code = 200, body = "[]"))
        val tokenStore = TokenChangesAfterFirstReadStore()
        val client = AuthenticatedApiClient(
            client = OkHttpClient(),
            tokenStore = tokenStore,
            sessionRefresher = NeverRefreshSessionRefresher(),
        )

        val result = client.execute(
            Request.Builder()
                .url(server.url("/api/v1/wearables/connections/"))
                .get()
                .build(),
        )

        assertTrue(result is AuthenticatedApiResult.Response)
        result as AuthenticatedApiResult.Response
        assertEquals(200, result.statusCode)
        assertEquals(
            "Bearer expired-access-token",
            server.takeRequest().headers["Authorization"],
        )
        assertEquals(
            "Bearer concurrently-refreshed-access-token",
            server.takeRequest().headers["Authorization"],
        )
    }
}

private class TestAuthTokenStore(
    var tokens: AuthTokens?,
) : AuthTokenStore {
    override suspend fun saveTokens(
        accessToken: String,
        refreshToken: String,
    ) {
        tokens = AuthTokens(accessToken, refreshToken)
    }

    override suspend fun readTokens(): AuthTokens? = tokens

    override suspend fun clearTokens() {
        tokens = null
    }
}

private class NeverRefreshSessionRefresher : SessionRefresher {
    override suspend fun refreshSession(): Boolean =
        error("A successful product request must not refresh the session.")
}

private class RecordingSessionRefresher(
    private val tokenStore: TestAuthTokenStore,
) : SessionRefresher {
    var refreshRequests: Int = 0
        private set

    override suspend fun refreshSession(): Boolean {
        refreshRequests += 1
        tokenStore.saveTokens(
            accessToken = "refreshed-access-token",
            refreshToken = "rotated-refresh-token",
        )
        return true
    }
}

private class RejectedSessionRefresher(
    private val tokenStore: TestAuthTokenStore,
) : SessionRefresher {
    var refreshRequests: Int = 0
        private set

    override suspend fun refreshSession(): Boolean {
        refreshRequests += 1
        tokenStore.clearTokens()
        return false
    }
}

private class TokenChangesAfterFirstReadStore : AuthTokenStore {
    private var reads = 0

    override suspend fun saveTokens(
        accessToken: String,
        refreshToken: String,
    ) = error("This test simulates another request having already saved the tokens.")

    override suspend fun readTokens(): AuthTokens {
        reads += 1
        return if (reads == 1) {
            AuthTokens(
                accessToken = "expired-access-token",
                refreshToken = "old-refresh-token",
            )
        } else {
            AuthTokens(
                accessToken = "concurrently-refreshed-access-token",
                refreshToken = "rotated-refresh-token",
            )
        }
    }

    override suspend fun clearTokens() = Unit
}
