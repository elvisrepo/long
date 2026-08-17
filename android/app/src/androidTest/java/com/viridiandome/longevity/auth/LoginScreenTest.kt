package com.viridiandome.longevity.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.viridiandome.longevity.subscriptions.SyncPolicy
import com.viridiandome.longevity.subscriptions.SyncPolicyUiState
import com.viridiandome.longevity.wearables.BackgroundReadAccess
import com.viridiandome.longevity.wearables.WearableConnectionUiState
import com.viridiandome.longevity.wearables.network.WearableConnectionResponse
import com.viridiandome.longevity.wearables.sync.InitialWeightSyncUiState
import com.viridiandome.longevity.wearables.sync.ManualSyncAvailability
import java.time.Instant
import org.junit.Rule
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LoginScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun session_checking_replaces_login_form() {
        composeTestRule.setContent {
            LoginScreen(
                state = LoginFormState(
                    email = "",
                    password = "",
                    isCheckingSession = true,
                ),
                onEmailChange = {},
                onPasswordChange = {},
                onSignIn = {},
                onLogout = {},
            )
        }

        composeTestRule.onNodeWithText("Checking session...").assertIsDisplayed()
        composeTestRule.onNodeWithText("Email").assertDoesNotExist()
        composeTestRule.onNodeWithText("Password").assertDoesNotExist()
        composeTestRule.onNodeWithText("Sign in").assertDoesNotExist()
    }

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
                onLogout = {},
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
                onLogout = {},
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
                onLogout = {},
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
                onLogout = {},
            )
        }

        composeTestRule.onNodeWithText("Signed in").assertIsDisplayed()
        composeTestRule.onNodeWithText("Email").assertDoesNotExist()
        composeTestRule.onNodeWithText("Password").assertDoesNotExist()
        composeTestRule.onNodeWithText("Sign in").assertDoesNotExist()
    }

    @Test
    fun authenticated_state_forwards_logout_click() {
        var logoutRequested = false
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
                onLogout = { logoutRequested = true },
            )
        }

        composeTestRule.onNodeWithText("Logout").performClick()

        assertTrue(logoutRequested)
    }

    @Test
    fun authenticated_idle_state_forwards_health_connect_click() {
        var connectionRequested = false
        composeTestRule.setContent {
            LoginScreen(
                state = LoginFormState(
                    email = "user@example.com",
                    password = "",
                    isAuthenticated = true,
                ),
                wearableConnectionState = WearableConnectionUiState.Idle,
                onEmailChange = {},
                onPasswordChange = {},
                onSignIn = {},
                onLogout = {},
                onConnectHealthConnect = { connectionRequested = true },
            )
        }

        composeTestRule.onNodeWithText("Connect Health Connect")
            .performClick()

        assertTrue(connectionRequested)
    }

    @Test
    fun ready_health_connect_state_forwards_explicit_weight_sync_click() {
        var syncRequested = false
        composeTestRule.setContent {
            LoginScreen(
                state = LoginFormState(
                    email = "user@example.com",
                    password = "",
                    isAuthenticated = true,
                ),
                wearableConnectionState = WearableConnectionUiState.Ready(
                    WearableConnectionResponse(
                        id = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
                        provider = "health_connect",
                        status = "pending",
                        lastSyncedAt = null,
                        lastError = "",
                        createdAt = "2026-08-05T10:00:00Z",
                        updatedAt = "2026-08-05T10:00:00Z",
                    ),
                ),
                initialWeightSyncState = InitialWeightSyncUiState.Idle,
                manualSyncAvailability = ManualSyncAvailability.Available,
                onEmailChange = {},
                onPasswordChange = {},
                onSignIn = {},
                onLogout = {},
                onSyncWeight = { syncRequested = true },
            )
        }

        composeTestRule.onNodeWithText("Sync weight now").performClick()

        assertTrue(syncRequested)
    }

    @Test
    fun cooling_down_manual_sync_cannot_forward_another_click() {
        var syncRequested = false
        composeTestRule.setContent {
            LoginScreen(
                state = LoginFormState(
                    email = "free@example.com",
                    password = "",
                    isAuthenticated = true,
                ),
                wearableConnectionState = WearableConnectionUiState.Ready(
                    WearableConnectionResponse(
                        id = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
                        provider = "health_connect",
                        status = "connected",
                        lastSyncedAt = "2026-08-08T10:00:00Z",
                        lastError = "",
                        createdAt = "2026-08-05T10:00:00Z",
                        updatedAt = "2026-08-08T10:00:00Z",
                    ),
                ),
                manualSyncAvailability = ManualSyncAvailability.CoolingDown(
                    availableAt = Instant.parse("2026-08-08T10:30:00Z"),
                ),
                syncPolicyState = SyncPolicyUiState.Ready(
                    SyncPolicy(
                        automaticSyncEnabled = false,
                        syncIntervalMinutes = 30,
                    ),
                ),
                onEmailChange = {},
                onPasswordChange = {},
                onSignIn = {},
                onLogout = {},
                onSyncWeight = { syncRequested = true },
            )
        }

        composeTestRule.onNodeWithText("Sync weight now")
            .assertIsNotEnabled()
            .performClick()

        assertFalse(syncRequested)
    }

    @Test
    fun ready_connection_forwards_background_permission_click_when_required() {
        var backgroundPermissionRequested = false
        composeTestRule.setContent {
            LoginScreen(
                state = LoginFormState(
                    email = "user@example.com",
                    password = "",
                    isAuthenticated = true,
                ),
                wearableConnectionState = WearableConnectionUiState.Ready(
                    connection = WearableConnectionResponse(
                        id = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
                        provider = "health_connect",
                        status = "connected",
                        lastSyncedAt = null,
                        lastError = "",
                        createdAt = "2026-08-05T10:00:00Z",
                        updatedAt = "2026-08-05T10:00:00Z",
                    ),
                    backgroundReadAccess = BackgroundReadAccess.PermissionRequired,
                ),
                syncPolicyState = SyncPolicyUiState.Ready(
                    SyncPolicy(
                        automaticSyncEnabled = true,
                        syncIntervalMinutes = 15,
                    ),
                ),
                onEmailChange = {},
                onPasswordChange = {},
                onSignIn = {},
                onLogout = {},
                onEnableBackgroundSync = {
                    backgroundPermissionRequested = true
                },
            )
        }

        composeTestRule.onNodeWithText("Allow background sync").performClick()

        assertTrue(backgroundPermissionRequested)
    }

    @Test
    fun ready_connection_hides_background_action_when_feature_is_unavailable() {
        composeTestRule.setContent {
            LoginScreen(
                state = LoginFormState(
                    email = "user@example.com",
                    password = "",
                    isAuthenticated = true,
                ),
                wearableConnectionState = WearableConnectionUiState.Ready(
                    connection = WearableConnectionResponse(
                        id = "7df7e4ab-7e6f-4558-b9be-17c824fbf54e",
                        provider = "health_connect",
                        status = "connected",
                        lastSyncedAt = null,
                        lastError = "",
                        createdAt = "2026-08-05T10:00:00Z",
                        updatedAt = "2026-08-05T10:00:00Z",
                    ),
                    backgroundReadAccess = BackgroundReadAccess.Unavailable,
                ),
                onEmailChange = {},
                onPasswordChange = {},
                onSignIn = {},
                onLogout = {},
            )
        }

        composeTestRule.onNodeWithText("Allow background sync")
            .assertDoesNotExist()
        composeTestRule.onNodeWithText("Sync weight now").assertIsDisplayed()
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
                onLogout = {},
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
