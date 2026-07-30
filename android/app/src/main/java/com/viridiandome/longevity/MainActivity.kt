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

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LongevityTheme {
                var loginState by remember {
                    mutableStateOf(
                        LoginFormState(
                            email = "",
                            password = "",
                        ),
                    )
                }

                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    LoginScreen(
                        state = loginState,
                        onEmailChange = { email ->
                            loginState = loginState.copy(email = email)
                        },
                        onPasswordChange = { password ->
                            loginState = loginState.copy(password = password)
                        },
                        onSignIn = {},
                        modifier = Modifier.padding(innerPadding),
                    )
                }
            }
        }
    }
}
