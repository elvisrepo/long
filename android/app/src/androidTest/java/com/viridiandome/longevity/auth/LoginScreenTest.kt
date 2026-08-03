package com.viridiandome.longevity.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class LoginScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun blank_login_form_disables_sign_in() {
        composeTestRule.setContent {
            LoginScreen(
                state = LoginFormState(
                    email = "",
                    password = "",
                ),
                onEmailChange = {},
                onPasswordChange = {},
                onSignIn = {},
            )
        }

        composeTestRule.onNodeWithText("Email").assertIsDisplayed()
        composeTestRule.onNodeWithText("Password").assertIsDisplayed()
        composeTestRule.onNodeWithText("Sign in").assertIsNotEnabled()
    }

    @Test
    fun submitting_form_disables_button_and_shows_progress_text() {
        composeTestRule.setContent {
            LoginScreen(
                state = LoginFormState(
                    email = "user@example.com",
                    password = "secret-password",
                    isSubmitting = true,
                ),
                onEmailChange = {},
                onPasswordChange = {},
                onSignIn = {},
            )
        }

        composeTestRule
            .onNodeWithText("Signing in...")
            .assertIsDisplayed()
            .assertIsNotEnabled()
    }

    @Test
    fun failed_login_displays_safe_error_message() {
        composeTestRule.setContent {
            LoginScreen(
                state = LoginFormState(
                    email = "user@example.com",
                    password = "wrong-password",
                    errorMessage = "Invalid email or password.",
                ),
                onEmailChange = {},
                onPasswordChange = {},
                onSignIn = {},
            )
        }

        composeTestRule
            .onNodeWithText("Invalid email or password.")
            .assertIsDisplayed()
    }
}
