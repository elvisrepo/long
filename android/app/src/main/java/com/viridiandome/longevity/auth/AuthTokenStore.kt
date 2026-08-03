package com.viridiandome.longevity.auth

/**
 * Persistence boundary for JWT credentials.
 *
 * The HTTP repository can require durable token storage before reporting a
 * successful login without knowing which Android security mechanism stores them.
 */
interface AuthTokenStore {
    suspend fun saveTokens(
        accessToken: String,
        refreshToken: String,
    )
}
