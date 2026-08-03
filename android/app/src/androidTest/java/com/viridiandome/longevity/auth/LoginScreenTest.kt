package com.viridiandome.longevity.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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

    @Test
    fun authenticated_state_replaces_credentials_with_success_message() {
        composeTestRule.setContent {
            LoginScreen(
                state = LoginFormState(
                    email = "user@example.com",
                    password = "",
                    isAuthenticated = true,
                ),
                onEmailChange = {},
                onPasswordChange = {},
                onSignIn = {},
            )
        }

        composeTestRule.onNodeWithText("Signed in").assertIsDisplayed()
        composeTestRule.onNodeWithText("Email").assertDoesNotExist()
        composeTestRule.onNodeWithText("Password").assertDoesNotExist()
        composeTestRule.onNodeWithText("Sign in").assertDoesNotExist()
    }

    @Test
    fun password_visibility_control_toggles_masking() {
        composeTestRule.setContent {
            LoginScreen(
                state = LoginFormState(
                    email = "user@example.com",
                    password = "secret-password",
                ),
                onEmailChange = {},
                onPasswordChange = {},
                onSignIn = {},
            )
        }

        composeTestRule.onNodeWithText("Show password").performClick()
        composeTestRule.onNodeWithText("Hide password").assertIsDisplayed()
        composeTestRule.onNodeWithText("Show password").assertDoesNotExist()

        composeTestRule.onNodeWithText("Hide password").performClick()
        composeTestRule.onNodeWithText("Show password").assertIsDisplayed()
        composeTestRule.onNodeWithText("Hide password").assertDoesNotExist()
    }
}
