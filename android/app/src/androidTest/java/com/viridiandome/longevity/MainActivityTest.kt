package com.viridiandome.longevity

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextInput
import org.junit.Rule
import org.junit.Test

class MainActivityTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun entering_credentials_enables_sign_in() {
        composeTestRule.onNodeWithText("Email")
            .performTextInput("user@example.com")
        composeTestRule.onNodeWithText("Password")
            .performTextInput("secret-password")

        composeTestRule.onNodeWithText("Sign in")
            .assertIsEnabled()
    }
}
