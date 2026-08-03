package com.viridiandome.longevity.auth

/**
 * Authentication boundary used by the presentation layer.
 *
 * The ViewModel knows only this contract. Its HTTP implementation handles
 * serialization and secure token storage without exposing either to UI code.
 */
interface AuthRepository {
    /** Returns whether this client has a locally restorable authentication session. */
    suspend fun restoreSession(): Boolean

    suspend fun login(
        email: String,
        password: String,
    ): LoginResult
}
