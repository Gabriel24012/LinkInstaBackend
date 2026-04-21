package com.iha.test.linkinstareview.models

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TrackRequest(
    @SerialName("request_id") val requestId: String,
    @SerialName("post_url") val postUrl: String,
    @SerialName("target_group") val targetGroup: List<String>,
    @SerialName("device_push_token") val devicePushToken: String? = null
)

@Serializable
data class StartTrackResponse(
    val status: String,
    @SerialName("request_id") val requestId: String,
    val message: String
)

// Modelo detallado de interacción de usuario
@Serializable
data class UserInteraction(
    val username: String = "",
    @SerialName("displayName") val displayName: String = "",
    @SerialName("profilePicUrl") val profilePicUrl: String = "",
    @SerialName("isPrivate") val isPrivate: Boolean = false,
    @SerialName("isVerified") val isVerified: Boolean = false,
    @SerialName("gaveLike") val gaveLike: Boolean = false,
    @SerialName("commented") val commented: Boolean = false,
    @SerialName("commentText") val commentText: String = "",
    @SerialName("commentDate") val commentDate: String? = null,
    @SerialName("likeDate") val likeDate: String? = null,
    @SerialName("interactionCount") val interactionCount: Int = 0
)

// Resumen de estadísticas
@Serializable
data class InteractionSummary(
    @SerialName("totalLikes") val totalLikes: Int = 0,
    @SerialName("totalComments") val totalComments: Int = 0,
    @SerialName("uniqueUsers") val uniqueUsers: Int = 0,
    @SerialName("privateAccounts") val privateAccounts: Int = 0,
    @SerialName("verifiedAccounts") val verifiedAccounts: Int = 0
)

// Datos para la gráfica de barras
@Serializable
data class ChartData(
    val labels: List<String> = emptyList(),
    val likes: List<Int> = emptyList(),
    val comments: List<Int> = emptyList(),
    val total: List<Int> = emptyList()
)

// Resultados detallados completos
@Serializable
data class DetailedResults(
    val interactions: List<UserInteraction> = emptyList(),
    val summary: InteractionSummary = InteractionSummary(),
    @SerialName("chartData") val chartData: ChartData = ChartData()
)

@Serializable
data class Diagnostics(
    val likes: String = "",
    val comments: String = ""
)

@Serializable
data class InteractionResult(
    @SerialName("request_id") val requestId: String = "",
    @SerialName("post_url") val postUrl: String = "",
    val status: String = "processing",
    val likes: List<String> = emptyList(),
    val comments: List<String> = emptyList(),
    val reposts: List<String> = emptyList(),
    @SerialName("saved_metric_message")
    val savedMetricMessage: String =
        "Métrica de guardados inaccesible debido a las restricciones de privacidad de la plataforma",
    val error: String? = null,
    val diagnostics: Diagnostics? = null,
    @SerialName("detailed_results") val detailedResults: DetailedResults? = null
)

// Modelo procesado para la UI
data class ProcessedInteraction(
    val username: String,
    val displayName: String,
    val isPrivate: Boolean,
    val isVerified: Boolean,
    val gaveLike: Boolean,
    val commented: Boolean,
    val commentText: String,
    val totalInteractions: Int
)

data class ChartEntry(
    val username: String,
    val likes: Int,
    val comments: Int,
    val total: Int
)
