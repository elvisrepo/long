package com.viridiandome.longevity

import android.app.Application
import com.viridiandome.longevity.auth.AndroidKeystoreAuthTokenStore
import com.viridiandome.longevity.auth.AuthRepository
import com.viridiandome.longevity.auth.AuthTokenStore
import com.viridiandome.longevity.auth.network.AuthenticatedApiClient
import com.viridiandome.longevity.auth.network.HttpAuthRepository
import okhttp3.OkHttpClient

/**
 * Application-wide dependency container for the small Android MVP.
 *
 * These lazy properties create one shared HTTP client and one authentication
 * repository instead of rebuilding network infrastructure on every recomposition.
 * A dependency-injection framework would add ceremony before this app needs it.
 */
class LongevityApplication : Application() {
    private val httpClient: OkHttpClient by lazy {
        OkHttpClient()
    }

    private val tokenStore: AuthTokenStore by lazy {
        AndroidKeystoreAuthTokenStore(this)
    }

    val authRepository: AuthRepository by lazy {
        check(BuildConfig.API_BASE_URL.isNotBlank()) {
            "The production API base URL is not configured."
        }

        HttpAuthRepository(
            client = httpClient,
            baseUrl = BuildConfig.API_BASE_URL,
            tokenStore = tokenStore,
        )
    }

    val authenticatedApiClient: AuthenticatedApiClient by lazy {
        AuthenticatedApiClient(
            client = httpClient,
            tokenStore = tokenStore,
            authRepository = authRepository,
        )
    }
}
