package com.viridiandome.longevity.auth.network

import com.viridiandome.longevity.auth.AuthRepository
import com.viridiandome.longevity.auth.AuthTokenStore
import com.viridiandome.longevity.auth.LoginResult
import kotlinx.serialization.SerializationException
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.coroutines.executeAsync
import java.io.IOException

/**
 * Authenticates against Django's dedicated mobile-login endpoint.
 *
 * Credentials exist only in the request body. Tokens are passed directly to
 * [AuthTokenStore] and never returned to the ViewModel or Compose UI.
 */
class HttpAuthRepository(
    private val client: OkHttpClient,
    baseUrl: String,
    private val tokenStore: AuthTokenStore,
    private val json: Json = Json,
) : AuthRepository, SessionRefresher {
    private val loginUrl = baseUrl
        .toHttpUrl()
        .newBuilder()
        .addPathSegments("api/auth/mobile/login/")
        .build()
    private val refreshUrl = baseUrl
        .toHttpUrl()
        .newBuilder()
        .addPathSegments("api/auth/mobile/refresh/")
        .build()
    private val logoutUrl = baseUrl
        .toHttpUrl()
        .newBuilder()
        .addPathSegments("api/auth/mobile/logout/")
        .build()

    override suspend fun restoreSession(): Boolean {
        // Startup restoration is deliberately local. Product API requests use
        // the stored access token and refresh only if Django rejects it.
        return try {
            tokenStore.readTokens() != null
        } catch (_: IOException) {
            false
        }
    }

    override suspend fun refreshSession(): Boolean {
        // The repository owns token rotation and persistence so callers never
        // receive or inspect either JWT.
        val storedTokens = try {
            tokenStore.readTokens()
        } catch (_: IOException) {
            return false
        } ?: return false

        val requestJson = json.encodeToString(
            MobileRefreshRequest(refresh = storedTokens.refreshToken),
        )
        val request = Request.Builder()
            .url(refreshUrl)
            .post(requestJson.toRequestBody(JSON_MEDIA_TYPE))
            .build()

        try {
            client.newCall(request).executeAsync().use { response ->
                if (response.code == HTTP_UNAUTHORIZED) {
                    // Django has authoritatively rejected this refresh token.
                    // Keeping it would create a permanently stale local session.
                    tokenStore.clearTokens()
                    return false
                }
                if (!response.isSuccessful) {
                    return false
                }

                val refreshedTokens = json.decodeFromString<MobileRefreshResponse>(
                    response.body.string(),
                )
                tokenStore.saveTokens(
                    accessToken = refreshedTokens.access,
                    // SimpleJWT returns this only when refresh rotation is enabled.
                    refreshToken = refreshedTokens.refresh ?: storedTokens.refreshToken,
                )
                return true
            }
        } catch (_: IOException) {
            return false
        } catch (_: SerializationException) {
            return false
        }
    }

    override suspend fun login(
        email: String,
        password: String,
    ): LoginResult {
        val requestJson = json.encodeToString(
            MobileLoginRequest(
                email = email,
                password = password,
            ),
        )
        val request = Request.Builder()
            .url(loginUrl)
            .post(requestJson.toRequestBody(JSON_MEDIA_TYPE))
            .build()

        try {
            client.newCall(request).executeAsync().use { response ->
                if (!response.isSuccessful) {
                    return LoginResult.Failure(
                        decodeErrorMessage(response.body.string()),
                    )
                }

                val tokens = json.decodeFromString<MobileLoginResponse>(
                    response.body.string(),
                )
                tokenStore.saveTokens(
                    accessToken = tokens.access,
                    refreshToken = tokens.refresh,
                )
                return LoginResult.Success
            }
        } catch (_: IOException) {
            return LoginResult.Failure(GENERIC_LOGIN_ERROR)
        } catch (_: SerializationException) {
            return LoginResult.Failure(GENERIC_LOGIN_ERROR)
        }
    }

    override suspend fun logout(): Boolean {
        val storedTokens = try {
            tokenStore.readTokens()
        } catch (_: IOException) {
            return false
        } ?: return true

        val requestJson = json.encodeToString(
            MobileLogoutRequest(refresh = storedTokens.refreshToken),
        )
        val request = Request.Builder()
            .url(logoutUrl)
            .post(requestJson.toRequestBody(JSON_MEDIA_TYPE))
            .build()

        try {
            client.newCall(request).executeAsync().use { response ->
                // A 400 means Django considers the submitted refresh token invalid;
                // it cannot refresh again, so clearing the stale local pair is safe.
                if (!response.isSuccessful && response.code != HTTP_BAD_REQUEST) {
                    return false
                }

                tokenStore.clearTokens()
                return true
            }
        } catch (_: IOException) {
            // Preserve the pair so the user can retry server-side revocation.
            return false
        }
    }

    private fun decodeErrorMessage(responseBody: String): String =
        try {
            json.decodeFromString<MobileLoginErrorResponse>(responseBody).userMessage
        } catch (_: SerializationException) {
            // Never surface an unexpected proxy/server body directly to the UI.
            GENERIC_LOGIN_ERROR
        }

    private companion object {
        val JSON_MEDIA_TYPE = "application/json".toMediaType()
        const val HTTP_BAD_REQUEST = 400
        const val HTTP_UNAUTHORIZED = 401
        const val GENERIC_LOGIN_ERROR = "Unable to sign in. Please try again."
    }
}
