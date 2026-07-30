package com.viridiandome.longevity.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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

    fun signIn() {
        val credentials = _state.value
        if (!credentials.canSubmit) {
            return
        }

        // Change this before launching so a rapid second tap cannot start a
        // duplicate login request while the first coroutine is still queued.
        _state.update { current ->
            current.copy(
                isSubmitting = true,
                errorMessage = null,
            )
        }

        viewModelScope.launch {
            val result = authRepository.login(
                email = credentials.email,
                password = credentials.password,
            )

            when (result) {
                LoginResult.Success -> {
                    _state.update { current ->
                        current.copy(
                            // Do not retain the password after authentication succeeds.
                            password = "",
                            isSubmitting = false,
                            isAuthenticated = true,
                            errorMessage = null,
                        )
                    }
                }

                is LoginResult.Failure -> {
                    _state.update { current ->
                        current.copy(
                            isSubmitting = false,
                            isAuthenticated = false,
                            errorMessage = result.userMessage,
                        )
                    }
                }
            }
        }
    }
}
