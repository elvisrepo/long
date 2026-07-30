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
}
