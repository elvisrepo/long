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
import com.viridiandome.longevity.wearables.WearableConnectionUiState

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
    onConnectHealthConnect: () -> Unit = {},
    onRetryHealthConnect: () -> Unit = {},
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
            onConnectHealthConnect = onConnectHealthConnect,
            onRetryHealthConnect = onRetryHealthConnect,
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
    onConnectHealthConnect: () -> Unit,
    onRetryHealthConnect: () -> Unit,
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
            onConnect = onConnectHealthConnect,
            onRetry = onRetryHealthConnect,
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
    onConnect: () -> Unit,
    onRetry: () -> Unit,
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
            Text(text = "Connecting Health Connect...")
        }

        is WearableConnectionUiState.Ready -> {
            val statusText = when (state.connection.status) {
                "connected" -> "Connected"
                "pending" -> "Setup pending"
                "error" -> "Needs attention"
                else -> "Disconnected"
            }
            Text(text = statusText)
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
