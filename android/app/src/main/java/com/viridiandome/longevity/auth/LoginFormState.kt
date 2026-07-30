package com.viridiandome.longevity.auth

/**
 * Immutable values currently displayed by [LoginScreen].
 *
 * The password exists only in memory and is never written to saved state or storage.
 */
data class LoginFormState(
    val email: String,
    val password: String,
    val isSubmitting: Boolean = false,
    val isAuthenticated: Boolean = false,
    val errorMessage: String? = null,
) {
    // Derived state keeps the button rule in one place and prevents duplicate
    // taps while the repository is processing the current credentials.
    val canSubmit: Boolean
        get() = email.isNotBlank() && password.isNotBlank() && !isSubmitting

    // Override the data-class default so accidental logging reveals neither
    // the password nor the user's email address.
    override fun toString(): String =
        "LoginFormState(emailPresent=${email.isNotBlank()}, password=<redacted>, " +
            "isSubmitting=$isSubmitting, isAuthenticated=$isAuthenticated, " +
            "errorPresent=${errorMessage != null})"
}
