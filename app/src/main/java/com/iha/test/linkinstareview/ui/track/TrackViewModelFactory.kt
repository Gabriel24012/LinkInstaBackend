package com.iha.test.linkinstareview.ui.track

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.iha.test.linkinstareview.data.local.TargetUserDao
import com.iha.test.linkinstareview.data.remote.N8nApi

class TrackViewModelFactory(
    private val dao: TargetUserDao,
    private val api: N8nApi
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(TrackViewModel::class.java)) {
            return TrackViewModel(dao, api) as T
        }
        throw IllegalArgumentException("ViewModel no soportado: ${modelClass.name}")
    }
}
