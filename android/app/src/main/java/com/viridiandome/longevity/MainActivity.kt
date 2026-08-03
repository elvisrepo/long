package com.viridiandome.longevity

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.viridiandome.longevity.auth.LoginScreen
import com.viridiandome.longevity.auth.LoginViewModel
import com.viridiandome.longevity.auth.LoginViewModelFactory
import com.viridiandome.longevity.ui.theme.LongevityTheme

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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Draw behind the system bars. Scaffold supplies safe content padding below.
        enableEdgeToEdge()

        // setContent starts the Jetpack Compose UI tree for this activity.
        setContent {
            LongevityTheme {
                // Stop collecting when the Activity is not visible, then resume with
                // the ViewModel's latest state when its lifecycle starts again.
                val loginState by loginViewModel.state.collectAsStateWithLifecycle()

                // Scaffold provides the screen structure and system-bar insets.
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    LoginScreen(
                        state = loginState,
                        // State flows down; user events flow back to the ViewModel.
                        onEmailChange = loginViewModel::onEmailChange,
                        onPasswordChange = loginViewModel::onPasswordChange,
                        onSignIn = loginViewModel::signIn,
                        modifier = Modifier.padding(innerPadding),
                    )
                }
            }
        }
    }
}
