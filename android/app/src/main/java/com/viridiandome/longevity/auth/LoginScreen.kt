package com.viridiandome.longevity.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.viridiandome.longevity.ui.theme.LongevityTheme
import com.viridiandome.longevity.subscriptions.SyncPolicyUiState
import com.viridiandome.longevity.wearables.BackgroundReadAccess
import com.viridiandome.longevity.wearables.WearableConnectionUiState
import com.viridiandome.longevity.wearables.sync.InitialWeightSyncUiState
import com.viridiandome.longevity.wearables.sync.ManualSyncAvailability
import com.viridiandome.longevity.wearables.sync.WeightSyncFailure
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Stateless authentication UI.
 *
 * The caller owns [state]. This composable renders that state and reports user
 * actions through callbacks, which keeps it reusable and straightforward to test.
 */
@Composable
fun LoginScreen(
    state: LoginFormState,
    onEmailChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSignIn: () -> Unit,
    onLogout: () -> Unit,
    wearableConnectionState: WearableConnectionUiState =
        WearableConnectionUiState.Idle,
    initialWeightSyncState: InitialWeightSyncUiState =
        InitialWeightSyncUiState.Idle,
    manualSyncAvailability: ManualSyncAvailability =
        ManualSyncAvailability.Unconfigured,
    syncPolicyState: SyncPolicyUiState = SyncPolicyUiState.Idle,
    onConnectHealthConnect: () -> Unit = {},
    onDisconnectHealthConnect: () -> Unit = {},
    onRetryHealthConnect: () -> Unit = {},
    onEnableBackgroundSync: () -> Unit = {},
    onSyncWeight: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    if (state.isCheckingSession) {
        SessionCheckingContent(modifier = modifier)
        return
    }

    if (state.isAuthenticated) {
        AuthenticatedContent(
            state = state,
            onLogout = onLogout,
            wearableConnectionState = wearableConnectionState,
            initialWeightSyncState = initialWeightSyncState,
            manualSyncAvailability = manualSyncAvailability,
            syncPolicyState = syncPolicyState,
            onConnectHealthConnect = onConnectHealthConnect,
            onDisconnectHealthConnect = onDisconnectHealthConnect,
            onRetryHealthConnect = onRetryHealthConnect,
            onEnableBackgroundSync = onEnableBackgroundSync,
            onSyncWeight = onSyncWeight,
            modifier = modifier,
        )
        return
    }

    // Visibility is temporary presentation state. It defaults back to hidden
    // after Activity recreation and never changes where the password is stored.
    var isPasswordVisible by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text = "Longevity")

        Spacer(modifier = Modifier.height(24.dp))

        OutlinedTextField(
            value = state.email,
            onValueChange = onEmailChange,
            label = { Text(text = "Email") },
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
            ),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedTextField(
            value = state.password,
            onValueChange = onPasswordChange,
            label = { Text(text = "Password") },
            keyboardOptions = KeyboardOptions(
                // Retain password semantics for keyboards, accessibility, and autofill
                // even while the user temporarily reveals the drawn characters.
                keyboardType = KeyboardType.Password,
            ),
            // Masking controls only what is drawn; it does not encrypt or persist the value.
            visualTransformation = if (isPasswordVisible) {
                VisualTransformation.None
            } else {
                PasswordVisualTransformation()
            },
            trailingIcon = {
                TextButton(
                    onClick = {
                        isPasswordVisible = !isPasswordVisible
                    },
                ) {
                    Text(
                        text = if (isPasswordVisible) {
                            "Hide password"
                        } else {
                            "Show password"
                        },
                    )
                }
            },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        state.errorMessage?.let { errorMessage ->
            Spacer(modifier = Modifier.height(12.dp))

            // The ViewModel receives only client-sanitized repository messages;
            // raw backend error details must never be passed into this state.
            Text(
                text = errorMessage,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onSignIn,
            enabled = state.canSubmit,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = if (state.isSubmitting) {
                    "Signing in..."
                } else {
                    "Sign in"
                },
            )
        }
    }
}

/** Prevents the logged-out form from flashing while Django validates a stored session. */
@Composable
private fun SessionCheckingContent(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()

        Spacer(modifier = Modifier.height(16.dp))

        Text(text = "Checking session...")
    }
}

/** Confirms authentication without exposing credentials or stored JWTs. */
@Composable
private fun AuthenticatedContent(
    state: LoginFormState,
    onLogout: () -> Unit,
    wearableConnectionState: WearableConnectionUiState,
    initialWeightSyncState: InitialWeightSyncUiState,
    manualSyncAvailability: ManualSyncAvailability,
    syncPolicyState: SyncPolicyUiState,
    onConnectHealthConnect: () -> Unit,
    onDisconnectHealthConnect: () -> Unit,
    onRetryHealthConnect: () -> Unit,
    onEnableBackgroundSync: () -> Unit,
    onSyncWeight: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Signed in",
            style = MaterialTheme.typography.headlineMedium,
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(text = "Your Longevity session is ready.")

        Spacer(modifier = Modifier.height(24.dp))

        HealthConnectContent(
            state = wearableConnectionState,
            initialWeightSyncState = initialWeightSyncState,
            manualSyncAvailability = manualSyncAvailability,
            syncPolicyState = syncPolicyState,
            onConnect = onConnectHealthConnect,
            onDisconnect = onDisconnectHealthConnect,
            onRetry = onRetryHealthConnect,
            onEnableBackgroundSync = onEnableBackgroundSync,
            onSyncWeight = onSyncWeight,
        )

        state.errorMessage?.let { errorMessage ->
            Spacer(modifier = Modifier.height(12.dp))

            Text(
                text = errorMessage,
                color = MaterialTheme.colorScheme.error,
            )
        }

        Spacer(modifier = Modifier.height(24.dp))

        Button(
            onClick = onLogout,
            enabled = !state.isLoggingOut,
        ) {
            Text(
                text = if (state.isLoggingOut) {
                    "Logging out..."
                } else {
                    "Logout"
                },
            )
        }
    }
}

/** Renders connection state without initiating registration during composition. */
@Composable
private fun HealthConnectContent(
    state: WearableConnectionUiState,
    initialWeightSyncState: InitialWeightSyncUiState,
    manualSyncAvailability: ManualSyncAvailability,
    syncPolicyState: SyncPolicyUiState,
    onConnect: () -> Unit,
    onDisconnect: () -> Unit,
    onRetry: () -> Unit,
    onEnableBackgroundSync: () -> Unit,
    onSyncWeight: () -> Unit,
) {
    Text(
        text = "Health Connect",
        style = MaterialTheme.typography.titleMedium,
    )

    Spacer(modifier = Modifier.height(8.dp))

    when (state) {
        WearableConnectionUiState.Idle -> {
            Text(text = "Not connected")

            Spacer(modifier = Modifier.height(12.dp))

            // The explicit tap is the consent boundary for backend registration.
            Button(onClick = onConnect) {
                Text(text = "Connect Health Connect")
            }
        }

        WearableConnectionUiState.Loading -> {
            CircularProgressIndicator()
            Text(text = "Checking Health Connect...")
        }

        WearableConnectionUiState.PermissionRequired -> {
            Text(text = "Weight read permission is required.")
        }

        WearableConnectionUiState.PermissionDenied -> {
            Text(text = "Weight permission was not granted.")

            Spacer(modifier = Modifier.height(12.dp))

            Button(onClick = onRetry) {
                Text(text = "Retry")
            }
        }

        WearableConnectionUiState.ProviderUpdateRequired -> {
            Text(text = "Install or update Health Connect to continue.")
        }

        WearableConnectionUiState.HealthConnectUnavailable -> {
            Text(text = "Health Connect is not available on this device.")
        }

        is WearableConnectionUiState.Ready -> {
            val syncPolicy = (syncPolicyState as? SyncPolicyUiState.Ready)?.policy
            val statusText = when (state.connection.status) {
                "connected" -> "Connected"
                "pending" -> "Setup pending"
                "error" -> "Needs attention"
                else -> "Disconnected"
            }
            Text(text = statusText)

            if (syncPolicy != null) {
                Text(
                    text = if (syncPolicy.automaticSyncEnabled) {
                        "Automatic sync every ${syncPolicy.syncIntervalMinutes} minutes"
                    } else {
                        "Manual sync every ${syncPolicy.syncIntervalMinutes} minutes"
                    },
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (
                state.backgroundReadAccess ===
                BackgroundReadAccess.PermissionRequired &&
                syncPolicy?.automaticSyncEnabled == true
            ) {
                // Background health access is an additional explicit consent;
                // it never blocks the existing foreground sync action below.
                Button(onClick = onEnableBackgroundSync) {
                    Text(text = "Allow background sync")
                }

                Spacer(modifier = Modifier.height(12.dp))
            }

            InitialWeightSyncContent(
                state = initialWeightSyncState,
                availability = manualSyncAvailability,
                onSync = onSyncWeight,
                onReviewPermission = onRetry,
            )

            Spacer(modifier = Modifier.height(12.dp))

            TextButton(
                onClick = onDisconnect,
                enabled = !state.isDisconnecting,
            ) {
                Text(
                    text = if (state.isDisconnecting) {
                        "Disconnecting..."
                    } else {
                        "Disconnect Health Connect"
                    },
                )
            }

            if (state.disconnectFailed) {
                Text(
                    text = "Unable to disconnect Health Connect. Please try again.",
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }

        WearableConnectionUiState.Rejected -> {
            Text(text = "Health Connect is unavailable for your current plan.")
        }

        WearableConnectionUiState.NoSession -> {
            Text(text = "Your session expired. Log out and sign in again.")
        }

        WearableConnectionUiState.Unavailable -> {
            Text(text = "Unable to connect Health Connect.")

            Spacer(modifier = Modifier.height(12.dp))

            Button(onClick = onRetry) {
                Text(text = "Retry")
            }
        }
    }
}

/** Renders aggregate sync state without exposing records or receipt identifiers. */
@Composable
private fun InitialWeightSyncContent(
    state: InitialWeightSyncUiState,
    availability: ManualSyncAvailability,
    onSync: () -> Unit,
    onReviewPermission: () -> Unit,
) {
    val canSync = availability === ManualSyncAvailability.Available
    when (availability) {
        ManualSyncAvailability.Unconfigured,
        ManualSyncAvailability.Checking,
        -> Text(text = "Checking manual sync availability...")

        is ManualSyncAvailability.CoolingDown -> Text(
            text = "Sync available again at ${availability.availableAt.formatLocalTime()}.",
        )

        ManualSyncAvailability.Unavailable ->
            Text(text = "Unable to verify manual sync availability.")

        ManualSyncAvailability.Available -> Unit
    }

    when (state) {
        InitialWeightSyncUiState.Idle -> {
            Button(onClick = onSync, enabled = canSync) {
                Text(text = "Sync weight now")
            }
        }

        InitialWeightSyncUiState.Syncing -> {
            CircularProgressIndicator()
            Text(text = "Syncing weight...")
        }

        InitialWeightSyncUiState.NoData -> {
            Text(text = "No Samsung Health weight records found in the last 30 days.")
            Button(onClick = onSync, enabled = canSync) {
                Text(text = "Sync again")
            }
        }

        is InitialWeightSyncUiState.Completed -> {
            Text(
                text = "Weight sync complete: ${state.entriesImported} imported, " +
                    "${state.entriesSkipped} already present.",
            )
            Button(onClick = onSync, enabled = canSync) {
                Text(text = "Sync again")
            }
        }

        is InitialWeightSyncUiState.Interrupted -> {
            if (state.completedBatchCount > 0) {
                Text(
                    text = "${state.completedBatchCount} batch(es) completed before sync stopped.",
                )
            }
            Text(text = state.failure.userMessage())

            if (state.failure === WeightSyncFailure.PermissionRequired) {
                Button(onClick = onReviewPermission) {
                    Text(text = "Review Health Connect permission")
                }
            }

            if (
                state.failure !== WeightSyncFailure.AutomaticSyncDisabled &&
                state.failure !== WeightSyncFailure.Conflict &&
                state.failure !== WeightSyncFailure.Rejected &&
                state.failure !== WeightSyncFailure.NoSession
            ) {
                Button(onClick = onSync, enabled = canSync) {
                    Text(text = "Retry weight sync")
                }
            }
        }

        InitialWeightSyncUiState.Unavailable -> {
            Text(text = "Unable to sync weight right now.")
            Button(onClick = onSync, enabled = canSync) {
                Text(text = "Retry weight sync")
            }
        }
    }
}

private fun java.time.Instant.formatLocalTime(): String =
    DateTimeFormatter.ofPattern("HH:mm")
        .withZone(ZoneId.systemDefault())
        .format(this)

private fun WeightSyncFailure.userMessage(): String =
    when (this) {
        WeightSyncFailure.AutomaticSyncDisabled ->
            "Automatic weight sync is not available on the current plan."

        WeightSyncFailure.PermissionRequired ->
            "Health Connect weight permission is required."

        WeightSyncFailure.ReadUnavailable ->
            "Health Connect could not read weight records right now."

        WeightSyncFailure.Conflict ->
            "A stored health record conflicts with this sync."

        WeightSyncFailure.Rejected ->
            "The weight sync was rejected for this connection."

        WeightSyncFailure.NoSession ->
            "Your session expired. Log out and sign in again."

        WeightSyncFailure.Unavailable ->
            "The server could not complete the weight sync right now."
    }

@Preview(
    showBackground = true,
    showSystemUi = true,
)
@Composable
private fun LoginScreenPreview() {
    LongevityTheme {
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
}

@Preview(showBackground = true)
@Composable
private fun AuthenticatedContentPreview() {
    LongevityTheme {
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
}
