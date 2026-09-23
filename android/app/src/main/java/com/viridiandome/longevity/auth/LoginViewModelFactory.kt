package com.viridiandome.longevity.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider

/** Creates [LoginViewModel] with its repository dependency. */
class LoginViewModelFactory(
    private val authRepository: AuthRepository,
) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (!modelClass.isAssignableFrom(LoginViewModel::class.java)) {
            throw IllegalArgumentException("Unsupported ViewModel: ${modelClass.name}")
        }

        @Suppress("UNCHECKED_CAST")
        return LoginViewModel(authRepository) as T
    }
}
