package com.viridiandome.longevity

import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextInput
import androidx.test.platform.app.InstrumentationRegistry
import com.viridiandome.longevity.auth.AndroidKeystoreAuthTokenStore
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.BeforeClass

class MainActivityTest {
    companion object {
        @BeforeClass
        @JvmStatic
        fun clearStoredSessionBeforeActivityLaunch() = runBlocking {
            // Activity tests exercise the logged-out form. Clear any real local
            // session before createAndroidComposeRule launches the first Activity.
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            AndroidKeystoreAuthTokenStore(context).clearTokens()
        }
    }

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

    @Test
    fun view_model_preserves_in_memory_credentials_across_activity_recreation() {
        composeTestRule.onNodeWithText("Email")
            .performTextInput("user@example.com")
        composeTestRule.onNodeWithText("Password")
            .performTextInput("secret-password")

        composeTestRule.activityRule.scenario.recreate()

        composeTestRule.onNodeWithText("user@example.com")
            .assertIsDisplayed()
        composeTestRule.onNodeWithText("Sign in")
            .assertIsEnabled()
    }
}
