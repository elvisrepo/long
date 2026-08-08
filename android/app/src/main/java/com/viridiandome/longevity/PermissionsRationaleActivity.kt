package com.viridiandome.longevity

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.viridiandome.longevity.ui.theme.LongevityTheme

/** Explains the narrow Health Connect data use from the permission dialog link. */
class PermissionsRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            LongevityTheme {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = "Health Connect data use",
                        style = MaterialTheme.typography.headlineSmall,
                    )
                    Text(
                        text = "Longevity reads weight records you authorize " +
                            "and uploads normalized samples to your account. " +
                            "If you enable background sync, it may read those " +
                            "authorized records while the app is not visible. " +
                            "It does not write or delete Health Connect data.",
                        modifier = Modifier.padding(vertical = 16.dp),
                    )
                    Button(onClick = ::finish) {
                        Text(text = "Close")
                    }
                }
            }
        }
    }
}
