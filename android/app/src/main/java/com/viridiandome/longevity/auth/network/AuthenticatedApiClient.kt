package com.viridiandome.longevity.auth.network

import com.viridiandome.longevity.auth.AuthRepository
import com.viridiandome.longevity.auth.AuthTokenStore
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.coroutines.executeAsync
import java.io.IOException

/** Closed, body-buffered result returned to product-specific repositories. */
sealed interface AuthenticatedApiResult {
    class Response(
        val statusCode: Int,
        val body: String,
    ) : AuthenticatedApiResult {
        // API bodies may contain private health data, so diagnostics expose only size.
        override fun toString(): String =
            "AuthenticatedApiResult.Response(statusCode=$statusCode, bodyLength=${body.length})"
    }

    /** No readable JWT pair exists on this device. */
    data object NoSession : AuthenticatedApiResult

    /** Local storage, networking, or session validation is temporarily unavailable. */
    data object Unavailable : AuthenticatedApiResult
}

/**
 * Executes Django product API requests without exposing JWTs to UI code.
 *
 * The refresh dependency is injected now because the next TDD behavior will
 * use it to refresh and retry once after an access-token `401`.
 */
class AuthenticatedApiClient(
    private val client: OkHttpClient,
    private val tokenStore: AuthTokenStore,
    private val authRepository: AuthRepository,
) {
    private val refreshMutex = Mutex()

    suspend fun execute(request: Request): AuthenticatedApiResult {
        val tokens = try {
            tokenStore.readTokens()
        } catch (_: IOException) {
            return AuthenticatedApiResult.Unavailable
        } ?: return AuthenticatedApiResult.NoSession

        val firstResult = executeOnce(
            request = request,
            accessToken = tokens.accessToken,
        )
        if (firstResult !is AuthenticatedApiResult.Response ||
            firstResult.statusCode != HTTP_UNAUTHORIZED
        ) {
            return firstResult
        }

        return when (
            val replacement = replacementAccessToken(
                rejectedAccessToken = tokens.accessToken,
            )
        ) {
            is ReplacementAccessToken.Available -> executeOnce(
                request = request,
                accessToken = replacement.value,
            )

            is ReplacementAccessToken.Failed -> replacement.result
        }
    }

    private suspend fun replacementAccessToken(
        rejectedAccessToken: String,
    ): ReplacementAccessToken = refreshMutex.withLock {
        val currentTokens = try {
            tokenStore.readTokens()
        } catch (_: IOException) {
            return@withLock ReplacementAccessToken.Failed(
                AuthenticatedApiResult.Unavailable,
            )
        } ?: return@withLock ReplacementAccessToken.Failed(
            AuthenticatedApiResult.NoSession,
        )

        if (currentTokens.accessToken != rejectedAccessToken) {
            // Another request refreshed while this one waited for the lock.
            return@withLock ReplacementAccessToken.Available(
                currentTokens.accessToken,
            )
        }

        // A short-lived access token may expire between startup restoration and
        // this request. Refresh through the existing owner of rotation/storage.
        if (!authRepository.restoreSession()) {
            return@withLock ReplacementAccessToken.Failed(
                resultAfterFailedRefresh(),
            )
        }

        val refreshedTokens = try {
            tokenStore.readTokens()
        } catch (_: IOException) {
            return@withLock ReplacementAccessToken.Failed(
                AuthenticatedApiResult.Unavailable,
            )
        } ?: return@withLock ReplacementAccessToken.Failed(
            AuthenticatedApiResult.NoSession,
        )

        ReplacementAccessToken.Available(refreshedTokens.accessToken)
    }

    private suspend fun resultAfterFailedRefresh(): AuthenticatedApiResult =
        try {
            // Invalid refresh is authoritative and clears storage. Transient
            // refresh failures retain tokens, allowing a later retry.
            if (tokenStore.readTokens() == null) {
                AuthenticatedApiResult.NoSession
            } else {
                AuthenticatedApiResult.Unavailable
            }
        } catch (_: IOException) {
            AuthenticatedApiResult.Unavailable
        }

    private suspend fun executeOnce(
        request: Request,
        accessToken: String,
    ): AuthenticatedApiResult {
        val authenticatedRequest = request.newBuilder()
            .header(AUTHORIZATION_HEADER, "Bearer $accessToken")
            .build()

        return try {
            client.newCall(authenticatedRequest).executeAsync().use { response ->
                AuthenticatedApiResult.Response(
                    statusCode = response.code,
                    body = response.body.string(),
                )
            }
        } catch (_: IOException) {
            AuthenticatedApiResult.Unavailable
        }
    }

    private companion object {
        const val AUTHORIZATION_HEADER = "Authorization"
        const val HTTP_UNAUTHORIZED = 401
    }
}

private sealed interface ReplacementAccessToken {
    class Available(val value: String) : ReplacementAccessToken

    class Failed(val result: AuthenticatedApiResult) : ReplacementAccessToken
}
