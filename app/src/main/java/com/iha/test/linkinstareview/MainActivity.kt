package com.iha.test.linkinstareview

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.room.Room
import com.iha.test.linkinstareview.data.local.AppDatabase
import com.iha.test.linkinstareview.data.remote.NetworkModule
import com.iha.test.linkinstareview.ui.theme.LinkInstaReviewTheme
import com.iha.test.linkinstareview.ui.track.TrackScreen
import com.iha.test.linkinstareview.ui.track.TrackViewModel
import com.iha.test.linkinstareview.ui.track.TrackViewModelFactory

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val db = Room.databaseBuilder(
            applicationContext,
            AppDatabase::class.java,
            "linkinstareview.db"
        ).build()

        val api = NetworkModule.createN8nApi(BuildConfig.N8N_BASE_URL)
        val factory = TrackViewModelFactory(db.targetUserDao(), api)

        setContent {
            LinkInstaReviewTheme {
                val vm: TrackViewModel = viewModel(factory = factory)
                TrackScreen(vm = vm)
            }
        }
    }
}
