package com.viridiandome.longevity.auth.network

/** Rotates stored JWTs after Django rejects an expired access token. */
interface SessionRefresher {
    suspend fun refreshSession(): Boolean
}
