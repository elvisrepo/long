package com.viridiandome.longevity.auth

data class LoginFormState(
    val email: String,
    val password: String,
) {
    val canSubmit: Boolean
        get() = email.isNotBlank() && password.isNotBlank()
}
