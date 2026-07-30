package com.viridiandome.longevity.auth

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Owns login-screen state and coordinates authentication through [AuthRepository].
 *
 * Submission behavior is added in the next TDD step. Keeping the repository
 * injected now makes that behavior testable without Django or a physical phone.
 */
class LoginViewModel(
    private val authRepository: AuthRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(
        LoginFormState(
            email = "",
            password = "",
        ),
    )
    val state: StateFlow<LoginFormState> = _state.asStateFlow()

    fun onEmailChange(email: String) {
        _state.update { current ->
            current.copy(email = email)
        }
    }

    fun onPasswordChange(password: String) {
        _state.update { current ->
            current.copy(password = password)
        }
    }
}
