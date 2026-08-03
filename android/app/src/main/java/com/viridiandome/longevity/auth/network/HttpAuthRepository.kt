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
) : AuthRepository {
    private val loginUrl = baseUrl
        .toHttpUrl()
        .newBuilder()
        .addPathSegments("api/auth/mobile/login/")
        .build()

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

    private fun decodeErrorMessage(responseBody: String): String =
        try {
            json.decodeFromString<MobileLoginErrorResponse>(responseBody).userMessage
        } catch (_: SerializationException) {
            // Never surface an unexpected proxy/server body directly to the UI.
            GENERIC_LOGIN_ERROR
        }

    private companion object {
        val JSON_MEDIA_TYPE = "application/json".toMediaType()
        const val GENERIC_LOGIN_ERROR = "Unable to sign in. Please try again."
    }
}
