package com.viridiandome.longevity.auth

/**
 * Result exposed by [AuthRepository] to the presentation layer.
 *
 * JWTs deliberately do not cross this boundary into the UI. A successful
 * repository implementation will store them before returning [Success].
 */
sealed interface LoginResult {
    data object Success : LoginResult

    class Failure(
        val userMessage: String,
    ) : LoginResult
}
