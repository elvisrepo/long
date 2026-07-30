package com.viridiandome.longevity

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.viridiandome.longevity.auth.LoginFormState
import com.viridiandome.longevity.auth.LoginScreen
import com.viridiandome.longevity.ui.theme.LongevityTheme

/**
 * Android's entry point for the app.
 *
 * This activity hosts the Compose UI; it does not use an XML layout file.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Draw behind the system bars. Scaffold supplies safe content padding below.
        enableEdgeToEdge()

        // setContent starts the Jetpack Compose UI tree for this activity.
        setContent {
            LongevityTheme {
                // remember keeps this state across recompositions. We deliberately avoid
                // rememberSaveable because the password must not be persisted to saved state.
                var loginState by remember {
                    mutableStateOf(
                        LoginFormState(
                            email = "",
                            password = "",
                        ),
                    )
                }

                // Scaffold provides the screen structure and system-bar insets.
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    LoginScreen(
                        state = loginState,
                        // State flows down into LoginScreen; user events flow back through
                        // callbacks. Each callback replaces the immutable state with a copy.
                        onEmailChange = { email ->
                            loginState = loginState.copy(email = email)
                        },
                        onPasswordChange = { password ->
                            loginState = loginState.copy(password = password)
                        },
                        onSignIn = {
                            // Login submission will be delegated to a ViewModel next.
                            // Network requests should not live directly in the Activity.
                        },
                        modifier = Modifier.padding(innerPadding),
                    )
                }
            }
        }
    }
}
