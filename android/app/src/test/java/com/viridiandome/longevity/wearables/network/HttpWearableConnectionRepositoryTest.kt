package com.viridiandome.longevity.wearables.network

import com.viridiandome.longevity.auth.AuthRepository
import com.viridiandome.longevity.auth.AuthTokenStore
import com.viridiandome.longevity.auth.AuthTokens
import com.viridiandome.longevity.auth.LoginResult
import com.viridiandome.longevity.auth.network.AuthenticatedApiClient
import com.viridiandome.longevity.wearables.WearableConnectionRegistrationResult
import com.viridiandome.longevity.wearables.WearableConnectionResolutionResult
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

    @Test
    fun health_connect_registration_posts_django_contract() = runTest {
        server.enqueue(
            MockResponse(
                code = 201,
                body =
                    """
                    {
                      "id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
                      "provider": "health_connect",
                      "status": "pending",
                      "last_synced_at": null,
                      "last_error": "",
                      "created_at": "2026-08-04T10:00:00Z",
                      "updated_at": "2026-08-04T10:00:00Z"
                    }
                    """.trimIndent(),
            ),
        )
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.registerHealthConnect()

        assertTrue(result is WearableConnectionRegistrationResult.Success)
        result as WearableConnectionRegistrationResult.Success
        assertEquals("health_connect", result.connection.provider)
        assertEquals("pending", result.connection.status)
        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals(
            "/api/v1/wearables/connections/",
            request.url.encodedPath,
        )
        assertEquals(
            "application/json; charset=utf-8",
            request.headers["Content-Type"],
        )
        assertEquals(
            """{"provider":"health_connect"}""",
            request.body?.utf8(),
        )
    }

    @Test
    fun registration_without_tokens_returns_no_session_without_request() = runTest {
        val repository = buildRepository(tokens = null)

        val result = repository.registerHealthConnect()

        assertSame(WearableConnectionRegistrationResult.NoSession, result)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun django_registration_rejection_is_distinct_from_unavailability() = runTest {
        server.enqueue(
            MockResponse(
                code = 400,
                body = """{"provider":["This provider is already registered."]}""",
            ),
        )
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.registerHealthConnect()

        assertSame(WearableConnectionRegistrationResult.Rejected, result)
    }

    @Test
    fun registration_server_failure_returns_unavailable() = runTest {
        server.enqueue(MockResponse(code = 500))
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.registerHealthConnect()

        assertSame(WearableConnectionRegistrationResult.Unavailable, result)
    }

    @Test
    fun malformed_registration_success_body_returns_unavailable() = runTest {
        server.enqueue(MockResponse(code = 201, body = "not-json"))
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.registerHealthConnect()

        assertSame(WearableConnectionRegistrationResult.Unavailable, result)
    }

    @Test
    fun existing_health_connect_connection_is_reused_without_registration() = runTest {
        server.enqueue(
            MockResponse(
                code = 200,
                body =
                    """
                    [{
                      "id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
                      "provider": "health_connect",
                      "status": "connected",
                      "last_synced_at": "2026-08-04T10:00:00Z",
                      "last_error": "",
                      "created_at": "2026-08-01T10:00:00Z",
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

        val result = repository.getOrRegisterHealthConnect()

        assertTrue(result is WearableConnectionResolutionResult.Success)
        result as WearableConnectionResolutionResult.Success
        assertEquals(
            "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
            result.connection.id,
        )
        assertEquals(1, server.requestCount)
        assertEquals("GET", server.takeRequest().method)
    }

    @Test
    fun missing_health_connect_connection_is_registered_after_list_read() = runTest {
        server.enqueue(MockResponse(code = 200, body = "[]"))
        server.enqueue(
            MockResponse(
                code = 201,
                body =
                    """
                    {
                      "id": "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
                      "provider": "health_connect",
                      "status": "pending",
                      "last_synced_at": null,
                      "last_error": "",
                      "created_at": "2026-08-04T10:00:00Z",
                      "updated_at": "2026-08-04T10:00:00Z"
                    }
                    """.trimIndent(),
            ),
        )
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.getOrRegisterHealthConnect()

        assertTrue(result is WearableConnectionResolutionResult.Success)
        result as WearableConnectionResolutionResult.Success
        assertEquals("pending", result.connection.status)
        assertEquals("GET", server.takeRequest().method)
        val registrationRequest = server.takeRequest()
        assertEquals("POST", registrationRequest.method)
        assertEquals(
            """{"provider":"health_connect"}""",
            registrationRequest.body?.utf8(),
        )
        assertEquals(2, server.requestCount)
    }

    @Test
    fun connection_resolution_without_session_stops_before_registration() = runTest {
        val repository = buildRepository(tokens = null)

        val result = repository.getOrRegisterHealthConnect()

        assertEquals(WearableConnectionResolutionResult.NoSession, result)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun unavailable_connection_list_stops_before_registration() = runTest {
        server.enqueue(MockResponse(code = 500))
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.getOrRegisterHealthConnect()

        assertEquals(WearableConnectionResolutionResult.Unavailable, result)
        assertEquals("GET", server.takeRequest().method)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun rejected_health_connect_registration_is_preserved_by_resolution() = runTest {
        server.enqueue(MockResponse(code = 200, body = "[]"))
        server.enqueue(MockResponse(code = 400))
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.getOrRegisterHealthConnect()

        assertEquals(WearableConnectionResolutionResult.Rejected, result)
        assertEquals("GET", server.takeRequest().method)
        assertEquals("POST", server.takeRequest().method)
        assertEquals(2, server.requestCount)
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
