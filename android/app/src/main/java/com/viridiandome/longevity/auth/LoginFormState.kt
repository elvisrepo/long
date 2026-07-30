package com.viridiandome.longevity.auth

/**
 * Immutable values currently displayed by [LoginScreen].
 *
 * The password exists only in memory and is never written to saved state or storage.
 */
data class LoginFormState(
    val email: String,
    val password: String,
) {
    // Derived state keeps the button rule in one place instead of duplicating it in the UI.
    val canSubmit: Boolean
        get() = email.isNotBlank() && password.isNotBlank()
}
