package com.viridiandome.longevity

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.viridiandome.longevity.auth.LoginScreen
import com.viridiandome.longevity.auth.LoginViewModel
import com.viridiandome.longevity.auth.LoginViewModelFactory
import com.viridiandome.longevity.subscriptions.SyncPolicyViewModel
import com.viridiandome.longevity.subscriptions.SyncPolicyViewModelFactory
import com.viridiandome.longevity.subscriptions.SyncPolicyUiState
import com.viridiandome.longevity.ui.theme.LongevityTheme
import com.viridiandome.longevity.wearables.WearableConnectionViewModel
import com.viridiandome.longevity.wearables.WearableConnectionViewModelFactory
import com.viridiandome.longevity.wearables.WearableConnectionUiState
import com.viridiandome.longevity.wearables.healthconnect.BACKGROUND_READ_PERMISSION
import com.viridiandome.longevity.wearables.healthconnect.BACKGROUND_READ_PERMISSIONS
import com.viridiandome.longevity.wearables.healthconnect.WEIGHT_READ_PERMISSION
import com.viridiandome.longevity.wearables.healthconnect.WEIGHT_READ_PERMISSIONS
import com.viridiandome.longevity.wearables.sync.InitialWeightSyncViewModel
import com.viridiandome.longevity.wearables.sync.InitialWeightSyncViewModelFactory
import com.viridiandome.longevity.wearables.sync.WeightSyncScheduleAction
import com.viridiandome.longevity.wearables.sync.decideWeightSyncScheduleAction
import java.time.Instant

/**
 * Android's entry point for the app.
 *
 * This activity hosts the Compose UI; it does not use an XML layout file.
 */
class MainActivity : ComponentActivity() {
    // The Activity owns the ViewModel. Android retains it across configuration
    // changes, such as rotation, without saving the password to disk.
    private val loginViewModel: LoginViewModel by viewModels {
        val app = application as LongevityApplication
        LoginViewModelFactory(app.authRepository)
    }

    private val wearableConnectionViewModel: WearableConnectionViewModel by viewModels {
        val app = application as LongevityApplication
        WearableConnectionViewModelFactory(
            app.wearableConnectionRepository,
            app.healthConnectAccess,
        )
    }

    private val syncPolicyViewModel: SyncPolicyViewModel by viewModels {
        val app = application as LongevityApplication
        SyncPolicyViewModelFactory(app.syncPolicyRepository)
    }

    private val initialWeightSyncViewModel: InitialWeightSyncViewModel by viewModels {
        val app = application as LongevityApplication
        // Foreground taps now use the same incremental cursor semantics as the
        // worker. The first run still falls back to the bounded 30-day window.
        InitialWeightSyncViewModelFactory(
            runner = app.incrementalWeightSyncRunner,
            cursorStore = app.weightSyncCursorStore,
        )
    }

    private val healthPermissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) { grantedPermissions ->
        wearableConnectionViewModel.onWeightReadPermissionResult(
            isGranted = WEIGHT_READ_PERMISSION in grantedPermissions,
        )
    }

    private val backgroundHealthPermissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) { grantedPermissions ->
        wearableConnectionViewModel.onBackgroundReadPermissionResult(
            isGranted = BACKGROUND_READ_PERMISSION in grantedPermissions,
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val weightSyncScheduler =
            (application as LongevityApplication).weightSyncScheduler

        // Draw behind the system bars. Scaffold supplies safe content padding below.
        enableEdgeToEdge()

        // setContent starts the Jetpack Compose UI tree for this activity.
        setContent {
            LongevityTheme {
                // Stop collecting when the Activity is not visible, then resume with
                // the ViewModel's latest state when its lifecycle starts again.
                val loginState by loginViewModel.state.collectAsStateWithLifecycle()
                val wearableConnectionState by wearableConnectionViewModel.state
                    .collectAsStateWithLifecycle()
                val syncPolicyState by syncPolicyViewModel.state
                    .collectAsStateWithLifecycle()
                val initialWeightSyncState by initialWeightSyncViewModel.state
                    .collectAsStateWithLifecycle()
                val manualSyncAvailability by
                    initialWeightSyncViewModel.manualSyncAvailability
                        .collectAsStateWithLifecycle()

                // Logout removes the previous user's connection state. Merely
                // becoming authenticated does not register a wearable connection;
                // the user must choose Connect Health Connect below.
                LaunchedEffect(loginState.isAuthenticated) {
                    if (!loginState.isAuthenticated) {
                        wearableConnectionViewModel.resetForLogout()
                        initialWeightSyncViewModel.resetForLogout()
                        syncPolicyViewModel.resetForLogout()
                    } else {
                        syncPolicyViewModel.load()
                    }
                }

                // WorkManager survives process restarts. Only confirmed logout
                // cancels it; startup's temporary unauthenticated state does not.
                // Re-enqueueing the ready connection is safe because the scheduler
                // uses one unique periodic-work name per connection with UPDATE.
                LaunchedEffect(
                    loginState.isCheckingSession,
                    loginState.isAuthenticated,
                    wearableConnectionState,
                    syncPolicyState,
                ) {
                    when (
                        val action = decideWeightSyncScheduleAction(
                            isCheckingSession = loginState.isCheckingSession,
                            isAuthenticated = loginState.isAuthenticated,
                            connectionState = wearableConnectionState,
                            syncPolicyState = syncPolicyState,
                        )
                    ) {
                        is WeightSyncScheduleAction.Schedule ->
                            weightSyncScheduler.schedule(
                                connectionId = action.connectionId,
                                repeatIntervalMinutes =
                                    action.repeatIntervalMinutes,
                            )

                        WeightSyncScheduleAction.CancelAll ->
                            weightSyncScheduler.cancelAll()

                        WeightSyncScheduleAction.None -> Unit
                    }
                }

                // The plan supplies the cooldown; the latest successful cursor
                // from either Django or this device supplies its starting point.
                LaunchedEffect(wearableConnectionState, syncPolicyState) {
                    val connection = (
                        wearableConnectionState as?
                            WearableConnectionUiState.Ready
                        )?.connection
                    val policy = (
                        syncPolicyState as?
                            SyncPolicyUiState.Ready
                        )?.policy
                    if (connection != null && policy != null) {
                        initialWeightSyncViewModel.configureManualSync(
                            connectionId = connection.id,
                            cooldownMinutes = policy.syncIntervalMinutes,
                            backendLastSyncedAt = connection.lastSyncedAt
                                ?.let { timestamp ->
                                    runCatching { Instant.parse(timestamp) }
                                        .getOrNull()
                                },
                        )
                    }
                }

                // Activity Result owns the system permission screen. The
                // ViewModel owns why it is needed and what happens afterward.
                LaunchedEffect(wearableConnectionState) {
                    if (
                        wearableConnectionState ===
                        WearableConnectionUiState.PermissionRequired
                    ) {
                        healthPermissionLauncher.launch(WEIGHT_READ_PERMISSIONS)
                    }
                }

                // Scaffold provides the screen structure and system-bar insets.
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    LoginScreen(
                        state = loginState,
                        // State flows down; user events flow back to the ViewModel.
                        onEmailChange = loginViewModel::onEmailChange,
                        onPasswordChange = loginViewModel::onPasswordChange,
                        onSignIn = loginViewModel::signIn,
                        onLogout = loginViewModel::logout,
                        wearableConnectionState = wearableConnectionState,
                        initialWeightSyncState = initialWeightSyncState,
                        manualSyncAvailability = manualSyncAvailability,
                        syncPolicyState = syncPolicyState,
                        onConnectHealthConnect = wearableConnectionViewModel::load,
                        onRetryHealthConnect = wearableConnectionViewModel::retry,
                        onEnableBackgroundSync = {
                            // The user starts this separate additional-access
                            // request from an already-ready connection state.
                            backgroundHealthPermissionLauncher.launch(
                                BACKGROUND_READ_PERMISSIONS,
                            )
                        },
                        onSyncWeight = {
                            val connection = (
                                wearableConnectionState as?
                                    WearableConnectionUiState.Ready
                                )?.connection
                            if (connection != null) {
                                initialWeightSyncViewModel.sync(connection.id)
                            }
                        },
                        modifier = Modifier.padding(innerPadding),
                    )
                }
            }
        }
    }
}
