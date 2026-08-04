package com.viridiandome.longevity.wearables.network

import com.viridiandome.longevity.auth.AuthRepository
import com.viridiandome.longevity.auth.AuthTokenStore
import com.viridiandome.longevity.auth.AuthTokens
import com.viridiandome.longevity.auth.LoginResult
import com.viridiandome.longevity.auth.network.AuthenticatedApiClient
import com.viridiandome.longevity.wearables.WearableConnectionsResult
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

class HttpWearableConnectionRepositoryTest {
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
    fun existing_connections_are_read_through_authenticated_api_client() = runTest {
        server.enqueue(
            MockResponse(
                code = 200,
                body =
                    """
                    [{
                      "id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
                      "provider": "health_connect",
                      "status": "pending",
                      "last_synced_at": null,
                      "last_error": "",
                      "created_at": "2026-08-04T10:00:00Z",
                      "updated_at": "2026-08-04T10:00:00Z"
                    }]
                    """.trimIndent(),
            ),
        )
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.getConnections()

        assertTrue(result is WearableConnectionsResult.Success)
        result as WearableConnectionsResult.Success
        assertEquals(1, result.connections.size)
        assertEquals("health_connect", result.connections.single().provider)
        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals(
            "/api/v1/wearables/connections/",
            request.url.encodedPath,
        )
        assertEquals(
            "Bearer stored-access-token",
            request.headers["Authorization"],
        )
    }

    @Test
    fun empty_connection_list_is_a_successful_result() = runTest {
        server.enqueue(MockResponse(code = 200, body = "[]"))
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.getConnections()

        assertTrue(result is WearableConnectionsResult.Success)
        result as WearableConnectionsResult.Success
        assertTrue(result.connections.isEmpty())
    }

    @Test
    fun missing_tokens_return_no_session_without_an_http_request() = runTest {
        val repository = buildRepository(tokens = null)

        val result = repository.getConnections()

        assertSame(WearableConnectionsResult.NoSession, result)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun unsuccessful_http_response_returns_unavailable() = runTest {
        server.enqueue(MockResponse(code = 500))
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.getConnections()

        assertSame(WearableConnectionsResult.Unavailable, result)
    }

    @Test
    fun malformed_success_body_returns_unavailable() = runTest {
        server.enqueue(MockResponse(code = 200, body = "not-json"))
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.getConnections()

        assertSame(WearableConnectionsResult.Unavailable, result)
    }

    private fun buildRepository(tokens: AuthTokens?): HttpWearableConnectionRepository {
        val authenticatedApiClient = AuthenticatedApiClient(
            client = OkHttpClient(),
            tokenStore = FixedAuthTokenStore(tokens),
            authRepository = NeverRefreshAuthRepository(),
        )
        return HttpWearableConnectionRepository(
            authenticatedApiClient = authenticatedApiClient,
            baseUrl = server.url("/").toString(),
        )
    }
}

private class FixedAuthTokenStore(
    private val tokens: AuthTokens?,
) : AuthTokenStore {
    override suspend fun saveTokens(
        accessToken: String,
        refreshToken: String,
    ) = error("Token writes are not expected in this repository test.")

    override suspend fun readTokens(): AuthTokens? = tokens

    override suspend fun clearTokens() = Unit
}

private class NeverRefreshAuthRepository : AuthRepository {
    override suspend fun restoreSession(): Boolean =
        error("A successful connection read must not refresh the session.")

    override suspend fun login(
        email: String,
        password: String,
    ): LoginResult = error("Login is not under test.")

    override suspend fun logout(): Boolean = error("Logout is not under test.")
}
