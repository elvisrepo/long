package com.viridiandome.longevity.auth

/**
 * Authentication boundary used by the presentation layer.
 *
 * The ViewModel knows only this contract. A later implementation will handle
 * HTTP serialization and secure token storage without exposing either to UI code.
 */
interface AuthRepository {
    suspend fun login(
        email: String,
        password: String,
    ): LoginResult
}
