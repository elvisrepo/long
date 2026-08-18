package com.viridiandome.longevity.wearables.network

import com.viridiandome.longevity.auth.AuthTokenStore
import com.viridiandome.longevity.auth.AuthTokens
import com.viridiandome.longevity.auth.network.AuthenticatedApiClient
import com.viridiandome.longevity.auth.network.SessionRefresher
import com.viridiandome.longevity.wearables.HealthConnectStepsSample
import com.viridiandome.longevity.wearables.HealthConnectWeightSample
import com.viridiandome.longevity.wearables.WearableUploadResult
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
import java.time.Instant

class HttpWearableUploadRepositoryTest {
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
    fun new_weight_batch_posts_authenticated_contract_and_returns_receipt() = runTest {
        server.enqueue(
            MockResponse(
                code = 201,
                body = successfulReceiptJson(),
            ),
        )
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.uploadWeightBatch(
            connectionId = CONNECTION_ID,
            uploadId = UPLOAD_ID,
            samples = listOf(weightSample()),
        )

        assertTrue(result is WearableUploadResult.Success)
        result as WearableUploadResult.Success
        assertEquals("succeeded", result.receipt.status)
        assertEquals(1, result.receipt.entriesImported)
        assertEquals(0, result.receipt.entriesSkipped)

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/wearables/uploads/", request.url.encodedPath)
        assertEquals(
            "Bearer stored-access-token",
            request.headers["Authorization"],
        )
        assertEquals(
            "application/json; charset=utf-8",
            request.headers["Content-Type"],
        )
        assertEquals(
            """{"connection_id":"$CONNECTION_ID","upload_id":"$UPLOAD_ID","entries":[{"metric_definition":"body_weight","value":78.4,"recorded_at":"2026-08-05T08:00:00Z","source":"samsung_health","external_source_id":"health_connect:WeightRecord:record-123"}]}""",
            request.body?.utf8(),
        )
    }

    @Test
    fun new_steps_batch_posts_authenticated_interval_contract() = runTest {
        server.enqueue(
            MockResponse(
                code = 201,
                body = successfulReceiptJson(),
            ),
        )
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.uploadStepsBatch(
            connectionId = CONNECTION_ID,
            uploadId = UPLOAD_ID,
            samples = listOf(stepsSample()),
        )

        assertTrue(result is WearableUploadResult.Success)
        val request = server.takeRequest()
        assertEquals(
            """{"connection_id":"$CONNECTION_ID","upload_id":"$UPLOAD_ID","entries":[{"metric_definition":"steps","value":420.0,"period_start":"2026-08-05T07:45:00Z","recorded_at":"2026-08-05T08:00:00Z","source":"samsung_health","external_source_id":"health_connect:StepsRecord:record-steps-123"}]}""",
            request.body?.utf8(),
        )
    }

    @Test
    fun exact_retry_with_200_returns_the_existing_receipt_as_success() = runTest {
        server.enqueue(
            MockResponse(
                code = 200,
                body = successfulReceiptJson(),
            ),
        )
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.uploadWeightBatch(
            connectionId = CONNECTION_ID,
            uploadId = UPLOAD_ID,
            samples = listOf(weightSample()),
        )

        assertTrue(result is WearableUploadResult.Success)
        result as WearableUploadResult.Success
        assertEquals(UPLOAD_ID, result.receipt.uploadId)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun django_content_conflict_is_returned_as_a_distinct_result() = runTest {
        server.enqueue(
            MockResponse(
                code = 409,
                body = """{"detail":"Upload identity conflicts with stored content."}""",
            ),
        )
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        val result = repository.uploadWeightBatch(
            connectionId = CONNECTION_ID,
            uploadId = UPLOAD_ID,
            samples = listOf(weightSample()),
        )

        assertSame(WearableUploadResult.Conflict, result)
    }

    @Test
    fun missing_session_sends_no_health_payload() = runTest {
        val repository = buildRepository(tokens = null)

        val result = repository.uploadWeightBatch(
            connectionId = CONNECTION_ID,
            uploadId = UPLOAD_ID,
            samples = listOf(weightSample()),
        )

        assertSame(WearableUploadResult.NoSession, result)
        assertEquals(0, server.requestCount)
    }

    @Test
    fun invalid_batch_or_unavailable_connection_is_rejected() = runTest {
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )

        listOf(400, 404).forEach { statusCode ->
            server.enqueue(MockResponse(code = statusCode))

            val result = repository.uploadWeightBatch(
                connectionId = CONNECTION_ID,
                uploadId = UPLOAD_ID,
                samples = listOf(weightSample()),
            )

            assertSame(WearableUploadResult.Rejected, result)
        }
        assertEquals(2, server.requestCount)
    }

    @Test
    fun malformed_success_or_server_failure_is_retryable_unavailability() = runTest {
        val repository = buildRepository(
            tokens = AuthTokens(
                accessToken = "stored-access-token",
                refreshToken = "stored-refresh-token",
            ),
        )
        listOf(
            MockResponse(code = 201, body = "not-json"),
            MockResponse(
                code = 201,
                body = successfulReceiptJson().replace(
                    "2026-08-05T08:00:01Z",
                    "not-a-timestamp",
                ),
            ),
            MockResponse(code = 500),
        ).forEach { response ->
            server.enqueue(response)

            val result = repository.uploadWeightBatch(
                connectionId = CONNECTION_ID,
                uploadId = UPLOAD_ID,
                samples = listOf(weightSample()),
            )

            assertSame(WearableUploadResult.Unavailable, result)
        }
        assertEquals(3, server.requestCount)
    }

    private fun buildRepository(tokens: AuthTokens?): HttpWearableUploadRepository {
        val authenticatedApiClient = AuthenticatedApiClient(
            client = OkHttpClient(),
            tokenStore = UploadTestAuthTokenStore(tokens),
            sessionRefresher = UploadTestSessionRefresher(),
        )
        return HttpWearableUploadRepository(
            authenticatedApiClient = authenticatedApiClient,
            baseUrl = server.url("/").toString(),
        )
    }

    private fun weightSample(): HealthConnectWeightSample =
        HealthConnectWeightSample(
            recordId = "record-123",
            kilograms = 78.4,
            recordedAt = Instant.parse("2026-08-05T08:00:00Z"),
            sourcePackageName = "com.sec.android.app.shealth",
        )

    private fun stepsSample(): HealthConnectStepsSample =
        HealthConnectStepsSample(
            recordId = "record-steps-123",
            count = 420,
            periodStart = Instant.parse("2026-08-05T07:45:00Z"),
            periodEnd = Instant.parse("2026-08-05T08:00:00Z"),
            sourcePackageName = "com.sec.android.app.shealth",
        )

    private fun successfulReceiptJson(): String =
        """
        {
          "id": "6ac744c4-8202-4cd7-91c7-3d44ea067381",
          "connection_id": "$CONNECTION_ID",
          "upload_id": "$UPLOAD_ID",
          "status": "succeeded",
          "received_at": "2026-08-05T08:00:01Z",
          "processing_started_at": "2026-08-05T08:00:01.010000Z",
          "finished_at": "2026-08-05T08:00:01.020000Z",
          "entries_imported": 1,
          "entries_skipped": 0
        }
        """.trimIndent()

    private companion object {
        const val CONNECTION_ID = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e"
        const val UPLOAD_ID = "9ea2c91d-63f4-40eb-a6bb-7fbd90c12a34"
    }
}

private class UploadTestAuthTokenStore(
    private val tokens: AuthTokens?,
) : AuthTokenStore {
    override suspend fun saveTokens(
        accessToken: String,
        refreshToken: String,
    ) = error("Token writes are not expected in this repository test.")

    override suspend fun readTokens(): AuthTokens? = tokens

    override suspend fun clearTokens() = Unit
}

private class UploadTestSessionRefresher : SessionRefresher {
    override suspend fun refreshSession(): Boolean =
        error("A successful upload must not refresh the session.")
}
