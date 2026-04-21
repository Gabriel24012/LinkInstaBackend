package com.iha.test.linkinstareview.ui.track

import com.iha.test.linkinstareview.models.ChartEntry
import com.iha.test.linkinstareview.models.InteractionResult
import com.iha.test.linkinstareview.models.InteractionSummary
import com.iha.test.linkinstareview.models.ProcessedInteraction
import com.iha.test.linkinstareview.models.UserInteraction

data class TrackUiState(
    val postUrl: String = "",
    val targetUsers: List<String> = emptyList(),
    val newTargetUser: String = "",
    val isSubmitting: Boolean = false,
    val isPolling: Boolean = false,
    val requestId: String? = null,
    val result: InteractionResult? = null,
    val error: String? = null,
    val savedMetricMessage: String =
        "Métrica de guardados inaccesible debido a las restricciones de privacidad de la plataforma",
    // Nuevos campos para datos procesados
    val processedInteractions: List<ProcessedInteraction> = emptyList(),
    val summary: InteractionSummary? = null,
    val chartData: List<ChartEntry> = emptyList(),
    val targetGroupInteractions: List<UserInteraction> = emptyList()
)