package com.viridiandome.longevity.subscriptions.network

import com.viridiandome.longevity.auth.AuthTokenStore
import com.viridiandome.longevity.auth.AuthTokens
import com.viridiandome.longevity.auth.network.AuthenticatedApiClient
import com.viridiandome.longevity.auth.network.SessionRefresher
import com.viridiandome.longevity.subscriptions.SyncPolicyResult
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class HttpSyncPolicyRepositoryTest {
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
    fun current_sync_policy_is_read_through_authenticated_api_client() = runTest {
        server.enqueue(
            MockResponse(
                code = 200,
                body =
                    """
                    {
                      "id": "53270422-14ce-458c-b3dc-69c52351a461",
                      "status": "active",
                      "billing_portal_available": false,
                      "plan": {
                        "code": "pro",
                        "name": "Pro",
                        "automatic_sync_enabled": true,
                        "sync_interval_minutes": 15
                      }
                    }
                    """.trimIndent(),
            ),
        )
        val repository = buildRepository(
            AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.getCurrentSyncPolicy()

        assertTrue(result is SyncPolicyResult.Success)
        result as SyncPolicyResult.Success
        assertTrue(result.policy.automaticSyncEnabled)
        assertEquals(15L, result.policy.syncIntervalMinutes)
        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals(
            "/api/v1/subscriptions/current/",
            request.url.encodedPath,
        )
        assertEquals(
            "Bearer stored-access-token",
            request.headers["Authorization"],
        )
    }

    @Test
    fun missing_tokens_return_no_session_without_an_http_request() = runTest {
        val repository = buildRepository(tokens = null)

        val result = repository.getCurrentSyncPolicy()

        assertSame(SyncPolicyResult.NoSession, result)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun automatic_interval_below_workmanager_minimum_returns_unavailable() = runTest {
        server.enqueue(
            MockResponse(
                code = 200,
                body =
                    """
                    {
                      "plan": {
                        "automatic_sync_enabled": true,
                        "sync_interval_minutes": 14
                      }
                    }
                    """.trimIndent(),
            ),
        )
        val repository = buildRepository(
            AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.getCurrentSyncPolicy()

        assertSame(SyncPolicyResult.Unavailable, result)
    }

    private fun buildRepository(tokens: AuthTokens?): HttpSyncPolicyRepository {
        val client = AuthenticatedApiClient(
            client = OkHttpClient(),
            tokenStore = SyncPolicyTokenStore(tokens),
            sessionRefresher = SyncPolicyNeverRefresh(),
        )
        return HttpSyncPolicyRepository(
            authenticatedApiClient = client,
            baseUrl = server.url("/").toString(),
        )
    }
}

private class SyncPolicyTokenStore(
    private val tokens: AuthTokens?,
) : AuthTokenStore {
    override suspend fun saveTokens(
        accessToken: String,
        refreshToken: String,
    ) = error("Token writes are not expected in this repository test.")

    override suspend fun readTokens(): AuthTokens? = tokens

    override suspend fun clearTokens() = Unit
}

private class SyncPolicyNeverRefresh : SessionRefresher {
    override suspend fun refreshSession(): Boolean =
        error("A successful policy read must not refresh the session.")
}
