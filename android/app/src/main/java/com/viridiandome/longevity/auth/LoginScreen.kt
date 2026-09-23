package com.viridiandome.longevity.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.viridiandome.longevity.ui.theme.LongevityTheme
import com.viridiandome.longevity.subscriptions.SyncPolicy
import com.viridiandome.longevity.subscriptions.SyncPolicyUiState
import com.viridiandome.longevity.wearables.BackgroundReadAccess
import com.viridiandome.longevity.wearables.WearableConnectionUiState
import com.viridiandome.longevity.wearables.network.WearableConnectionResponse
import com.viridiandome.longevity.wearables.sync.InitialWeightSyncUiState
import com.viridiandome.longevity.wearables.sync.AutomaticSyncAttempt
import com.viridiandome.longevity.wearables.sync.ManualSyncAvailability
import com.viridiandome.longevity.wearables.sync.WeightSyncFailure
import java.time.Instant
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
    latestBackgroundAttempt: AutomaticSyncAttempt? = null,
    latestForegroundAttempt: AutomaticSyncAttempt? = null,
    showAutomaticSyncDiagnostics: Boolean = false,
    onRefreshAutomaticSyncDiagnostics: () -> Unit = {},
    onConnectHealthConnect: () -> Unit = {},
    onDisconnectHealthConnect: () -> Unit = {},
    onRetryHealthConnect: () -> Unit = {},
    onEnableBackgroundSync: () -> Unit = {},
    onSyncMetrics: () -> Unit = {},
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
            latestBackgroundAttempt = latestBackgroundAttempt,
            latestForegroundAttempt = latestForegroundAttempt,
            showAutomaticSyncDiagnostics = showAutomaticSyncDiagnostics,
            onRefreshAutomaticSyncDiagnostics = onRefreshAutomaticSyncDiagnostics,
            onConnectHealthConnect = onConnectHealthConnect,
            onDisconnectHealthConnect = onDisconnectHealthConnect,
            onRetryHealthConnect = onRetryHealthConnect,
            onEnableBackgroundSync = onEnableBackgroundSync,
            onSyncMetrics = onSyncMetrics,
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
        Text(
            text = "⬡ Longevity",
            style = MaterialTheme.typography.headlineMedium,
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Sign in to sync Samsung Health.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

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
    latestBackgroundAttempt: AutomaticSyncAttempt?,
    latestForegroundAttempt: AutomaticSyncAttempt?,
    showAutomaticSyncDiagnostics: Boolean,
    onRefreshAutomaticSyncDiagnostics: () -> Unit,
    onConnectHealthConnect: () -> Unit,
    onDisconnectHealthConnect: () -> Unit,
    onRetryHealthConnect: () -> Unit,
    onEnableBackgroundSync: () -> Unit,
    onSyncMetrics: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var diagnosticsExpanded by remember { mutableStateOf(false) }
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = "⬡ Longevity",
                style = MaterialTheme.typography.titleLarge,
            )
            Spacer(modifier = Modifier.weight(1f))
            TextButton(
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

        HealthConnectCard(
            state = wearableConnectionState,
            initialWeightSyncState = initialWeightSyncState,
            manualSyncAvailability = manualSyncAvailability,
            syncPolicyState = syncPolicyState,
            onConnect = onConnectHealthConnect,
            onDisconnect = onDisconnectHealthConnect,
            onRetry = onRetryHealthConnect,
            onEnableBackgroundSync = onEnableBackgroundSync,
            onSyncMetrics = onSyncMetrics,
        )

        if (showAutomaticSyncDiagnostics) {
            DiagnosticsCard(
                expanded = diagnosticsExpanded,
                onToggleExpanded = { diagnosticsExpanded = !diagnosticsExpanded },
                latestBackgroundAttempt = latestBackgroundAttempt,
                latestForegroundAttempt = latestForegroundAttempt,
                onRefresh = onRefreshAutomaticSyncDiagnostics,
            )
        }

        state.errorMessage?.let { errorMessage ->
            Text(
                text = errorMessage,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

/** Connection status, sync actions, and disconnect grouped in one card. */
@Composable
private fun HealthConnectCard(
    state: WearableConnectionUiState,
    initialWeightSyncState: InitialWeightSyncUiState,
    manualSyncAvailability: ManualSyncAvailability,
    syncPolicyState: SyncPolicyUiState,
    onConnect: () -> Unit,
    onDisconnect: () -> Unit,
    onRetry: () -> Unit,
    onEnableBackgroundSync: () -> Unit,
    onSyncMetrics: () -> Unit,
    modifier: Modifier = Modifier,
) {
    ElevatedCard(modifier = modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ConnectionStatusHeader(state = state)

            when (state) {
                WearableConnectionUiState.Idle -> {
                    Text(text = "Not connected")

                    Button(
                        onClick = onConnect,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(text = "Connect Health Connect")
                    }
                }

                WearableConnectionUiState.Loading -> {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        CircularProgressIndicator()
                        Text(text = "Checking Health Connect...")
                    }
                }

                WearableConnectionUiState.PermissionRequired -> {
                    Text(text = "Weight read permission is required.")
                }

                WearableConnectionUiState.PermissionDenied -> {
                    Text(text = "Weight permission was not granted.")

                    Button(
                        onClick = onRetry,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
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
                    ReadyConnectionBody(
                        state = state,
                        initialWeightSyncState = initialWeightSyncState,
                        manualSyncAvailability = manualSyncAvailability,
                        syncPolicyState = syncPolicyState,
                        onDisconnect = onDisconnect,
                        onRetry = onRetry,
                        onEnableBackgroundSync = onEnableBackgroundSync,
                        onSyncMetrics = onSyncMetrics,
                    )
                }

                WearableConnectionUiState.Rejected -> {
                    Text(text = "Health Connect is unavailable for your current plan.")
                }

                WearableConnectionUiState.NoSession -> {
                    Text(text = "Your session expired. Log out and sign in again.")
                }

                WearableConnectionUiState.Unavailable -> {
                    Text(text = "Unable to connect Health Connect.")

                    Button(
                        onClick = onRetry,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(text = "Retry")
                    }
                }
            }
        }
    }
}

/** Status dot plus title; color follows connection health, not brand. */
@Composable
private fun ConnectionStatusHeader(
    state: WearableConnectionUiState,
    modifier: Modifier = Modifier,
) {
    val (statusText, dotColor) = when (state) {
        is WearableConnectionUiState.Ready -> when (state.connection.status) {
            "connected" -> "Connected" to MaterialTheme.colorScheme.primary
            "pending" -> "Setup pending" to MaterialTheme.colorScheme.tertiary
            "error" -> "Needs attention" to MaterialTheme.colorScheme.error
            else -> "Disconnected" to MaterialTheme.colorScheme.outline
        }
        WearableConnectionUiState.Loading -> "Checking..." to MaterialTheme.colorScheme.outline
        else -> "Not connected" to MaterialTheme.colorScheme.outline
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = modifier.fillMaxWidth(),
    ) {
        Box(
            modifier = Modifier
                .size(12.dp)
                .clip(CircleShape)
                .background(dotColor),
        )
        Text(
            text = "Health Connect",
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = statusText,
            style = MaterialTheme.typography.bodyMedium,
            color = if (dotColor == MaterialTheme.colorScheme.error) {
                MaterialTheme.colorScheme.error
            } else {
                MaterialTheme.colorScheme.onSurfaceVariant
            },
        )
    }
}

/** Ready-state sync policy, last sync, manual sync, and disconnect. */
@Composable
private fun ReadyConnectionBody(
    state: WearableConnectionUiState.Ready,
    initialWeightSyncState: InitialWeightSyncUiState,
    manualSyncAvailability: ManualSyncAvailability,
    syncPolicyState: SyncPolicyUiState,
    onDisconnect: () -> Unit,
    onRetry: () -> Unit,
    onEnableBackgroundSync: () -> Unit,
    onSyncMetrics: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = modifier.fillMaxWidth(),
    ) {
        val syncPolicy = (syncPolicyState as? SyncPolicyUiState.Ready)?.policy
        if (syncPolicy != null) {
            Text(
                text = if (syncPolicy.automaticSyncEnabled) {
                    "Automatic sync approximately every " +
                        "${syncPolicy.syncIntervalMinutes} minutes"
                } else {
                    "Manual sync every ${syncPolicy.syncIntervalMinutes} minutes"
                },
                style = MaterialTheme.typography.bodyMedium,
            )

            if (syncPolicy.automaticSyncEnabled) {
                // WorkManager respects the interval as a minimum. Android may
                // batch background work after the app leaves the foreground.
                Text(
                    text = "Android may delay sync while the app is closed.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        val lastSyncedAt = state.connection.lastSyncedAt
            ?.let { timestamp ->
                runCatching { Instant.parse(timestamp) }.getOrNull()
            }
        Text(
            text = if (lastSyncedAt != null) {
                "Last successful sync: ${lastSyncedAt.formatLocalDateTime()}"
            } else {
                "No successful sync yet."
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        if (
            state.backgroundReadAccess ===
            BackgroundReadAccess.PermissionRequired &&
            syncPolicy?.automaticSyncEnabled == true
        ) {
            // Background health access is an additional explicit consent;
            // it never blocks the existing foreground sync action below.
            Button(
                onClick = onEnableBackgroundSync,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(text = "Allow background sync")
            }
        }

        InitialWeightSyncContent(
            state = initialWeightSyncState,
            availability = manualSyncAvailability,
            onSync = onSyncMetrics,
            onReviewPermission = onRetry,
        )

        HorizontalDivider()

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
                color = MaterialTheme.colorScheme.error,
            )
        }

        if (state.disconnectFailed) {
            Text(
                text = "Unable to disconnect Health Connect. Please try again.",
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

/** Pilot-only background/foreground worker diagnostics. */
@Composable
private fun DiagnosticsCard(
    expanded: Boolean,
    onToggleExpanded: () -> Unit,
    latestBackgroundAttempt: AutomaticSyncAttempt?,
    latestForegroundAttempt: AutomaticSyncAttempt?,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedCard(modifier = modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            TextButton(onClick = onToggleExpanded) {
                Text(
                    text = if (expanded) {
                        "Hide automatic sync diagnostics"
                    } else {
                        "Automatic sync diagnostics"
                    },
                )
            }
            if (expanded) {
                Spacer(modifier = Modifier.height(8.dp))
                DiagnosticRow(
                    label = "While app away",
                    value = latestBackgroundAttempt.displayDiagnostic(),
                )
                Spacer(modifier = Modifier.height(4.dp))
                DiagnosticRow(
                    label = "While app visible",
                    value = latestForegroundAttempt.displayDiagnostic(),
                )
                Spacer(modifier = Modifier.height(8.dp))
                TextButton(onClick = onRefresh) {
                    Text("Refresh diagnostics")
                }
            }
        }
    }
}

@Composable
private fun DiagnosticRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

private fun AutomaticSyncAttempt?.displayDiagnostic(): String =
    this?.let { attempt ->
        "${attempt.startedAt.formatLocalDateTime()} — " +
            (attempt.outcome?.name?.lowercase() ?: "started")
    } ?: "No worker attempt recorded"

/** Renders aggregate sync state without exposing records or receipt identifiers. */
@Composable
private fun InitialWeightSyncContent(
    state: InitialWeightSyncUiState,
    availability: ManualSyncAvailability,
    onSync: () -> Unit,
    onReviewPermission: () -> Unit,
) {
    val canSync = availability === ManualSyncAvailability.Available
    if (availability is ManualSyncAvailability.CoolingDown) {
        Text(
            text = "Sync available again at ${availability.availableAt.formatLocalTime()}.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    when (availability) {
        ManualSyncAvailability.Unconfigured,
        ManualSyncAvailability.Checking,
        -> Text(text = "Checking manual sync availability...")

        is ManualSyncAvailability.CoolingDown -> Unit

        ManualSyncAvailability.Unavailable ->
            Text(text = "Unable to verify manual sync availability.")

        ManualSyncAvailability.Available -> Unit
    }

    when (state) {
        InitialWeightSyncUiState.Idle -> {
            Button(
                onClick = onSync,
                enabled = canSync,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(text = "Sync now")
            }
        }

        InitialWeightSyncUiState.Syncing -> {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                CircularProgressIndicator()
                Text(text = "Syncing health metrics...")
            }
        }

        InitialWeightSyncUiState.NoData -> {
            Text(text = "No new Samsung Health records found in the last 30 days.")
            Button(
                onClick = onSync,
                enabled = canSync,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(text = "Sync again")
            }
        }

        is InitialWeightSyncUiState.Completed -> {
            Text(
                text = "Sync complete: ${state.entriesImported} imported, " +
                    "${state.entriesUpdated} updated, " +
                    "${state.entriesSkipped} already present.",
            )
            Button(
                onClick = onSync,
                enabled = canSync,
                modifier = Modifier.fillMaxWidth(),
            ) {
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
                Button(
                    onClick = onReviewPermission,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(text = "Review Health Connect permission")
                }
            }

            if (
                state.failure !== WeightSyncFailure.AutomaticSyncDisabled &&
                state.failure !== WeightSyncFailure.Conflict &&
                state.failure !== WeightSyncFailure.Rejected &&
                state.failure !== WeightSyncFailure.NoSession
            ) {
                Button(
                    onClick = onSync,
                    enabled = canSync,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(text = "Retry sync")
                }
            }
        }

        InitialWeightSyncUiState.Unavailable -> {
            Text(text = "Unable to sync health metrics right now.")
            Button(
                onClick = onSync,
                enabled = canSync,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(text = "Retry sync")
            }
        }
    }
}

private fun java.time.Instant.formatLocalTime(): String =
    DateTimeFormatter.ofPattern("HH:mm")
        .withZone(ZoneId.systemDefault())
        .format(this)

private fun Instant.formatLocalDateTime(): String =
    DateTimeFormatter.ofPattern("MMM d, yyyy, HH:mm")
        .withZone(ZoneId.systemDefault())
        .format(this)

private fun WeightSyncFailure.userMessage(): String =
    when (this) {
        WeightSyncFailure.AutomaticSyncDisabled ->
            "Automatic sync is not available on the current plan."

        WeightSyncFailure.PermissionRequired ->
            "Health Connect metric permissions are required."

        WeightSyncFailure.ReadUnavailable ->
            "Health Connect could not read health records right now."

        WeightSyncFailure.Conflict ->
            "A stored health record conflicts with this sync."

        WeightSyncFailure.Rejected ->
            "The sync was rejected for this connection."

        WeightSyncFailure.NoSession ->
            "Your session expired. Log out and sign in again."

        WeightSyncFailure.Unavailable ->
            "The server could not complete the sync right now."
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

@Preview(showBackground = true)
@Composable
private fun AuthenticatedReadyPreview() {
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
            wearableConnectionState = WearableConnectionUiState.Ready(
                connection = WearableConnectionResponse(
                    id = "connection-id",
                    provider = "health_connect",
                    status = "connected",
                    lastSyncedAt = "2026-09-22T15:41:00Z",
                    lastError = "",
                    createdAt = "2026-09-22T15:00:00Z",
                    updatedAt = "2026-09-22T15:41:00Z",
                ),
            ),
            manualSyncAvailability = ManualSyncAvailability.Available,
            syncPolicyState = SyncPolicyUiState.Ready(
                policy = SyncPolicy(
                    automaticSyncEnabled = true,
                    syncIntervalMinutes = 15,
                ),
            ),
        )
    }
}
