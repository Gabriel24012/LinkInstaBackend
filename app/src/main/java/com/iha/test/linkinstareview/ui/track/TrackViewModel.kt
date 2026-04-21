package com.iha.test.linkinstareview.ui.track

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.iha.test.linkinstareview.data.local.TargetUserDao
import com.iha.test.linkinstareview.data.local.TargetUserEntity
import com.iha.test.linkinstareview.data.remote.N8nApi
import com.iha.test.linkinstareview.models.ChartEntry
import com.iha.test.linkinstareview.models.InteractionResult
import com.iha.test.linkinstareview.models.ProcessedInteraction
import com.iha.test.linkinstareview.models.TrackRequest
import com.iha.test.linkinstareview.models.UserInteraction
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.util.UUID

class TrackViewModel(
    private val dao: TargetUserDao,
    private val api: N8nApi
) : ViewModel() {

    private val _ui = MutableStateFlow(TrackUiState())
    val ui: StateFlow<TrackUiState> = _ui

    private var pollingJob: Job? = null

    init {
        viewModelScope.launch {
            dao.observeAll().collectLatest { users ->
                _ui.value = _ui.value.copy(targetUsers = users.map { it.username }.sorted())
            }
        }
    }

    fun onPostUrlChange(value: String) {
        _ui.value = _ui.value.copy(postUrl = value)
    }

    fun onNewTargetUserChange(value: String) {
        _ui.value = _ui.value.copy(newTargetUser = value)
    }

    fun addTargetUser() = viewModelScope.launch {
        val cleaned = _ui.value.newTargetUser.trim().lowercase().removePrefix("@")
        if (cleaned.isBlank()) return@launch
        dao.insert(TargetUserEntity(username = cleaned))
        _ui.value = _ui.value.copy(newTargetUser = "")
    }

    fun removeTargetUser(username: String) = viewModelScope.launch {
        dao.delete(username.trim().lowercase().removePrefix("@"))
    }

    fun cancelTracking() {
        pollingJob?.cancel()
        _ui.value = _ui.value.copy(
            isSubmitting = false,
            isPolling = false,
            error = "Rastreo cancelado por el usuario."
        )
    }

    fun submit(devicePushToken: String? = null) {
        pollingJob = viewModelScope.launch {
        runCatching {
            _ui.value = _ui.value.copy(
                isSubmitting = true,
                isPolling = false,
                result = null,
                error = null,
                processedInteractions = emptyList(),
                summary = null,
                chartData = emptyList(),
                targetGroupInteractions = emptyList()
            )

            val targetGroup = _ui.value.targetUsers
                .map { it.trim().lowercase().removePrefix("@") }
                .filter { it.isNotBlank() }
                .distinct()

            require(targetGroup.isNotEmpty()) { "El grupo objetivo está vacío." }
            require(_ui.value.postUrl.startsWith("http")) { "URL de post inválida." }

            val requestId = UUID.randomUUID().toString()
            val response = api.startTracking(
                TrackRequest(
                    requestId = requestId,
                    postUrl = _ui.value.postUrl.trim(),
                    targetGroup = targetGroup,
                    devicePushToken = devicePushToken
                )
            )

            if (response.isSuccessful) {
                _ui.value = _ui.value.copy(
                    requestId = requestId,
                    isSubmitting = false,
                    isPolling = true
                )
                pollStatus(requestId)
            } else {
                val errorBody = response.errorBody()?.string()
                throw Exception("Error ${response.code()}: $errorBody")
            }
        }.onFailure { ex ->
            _ui.value = _ui.value.copy(
                isSubmitting = false,
                isPolling = false,
                error = "Detalle del error: ${ex.message}"
            )
        }
        }
    }

    private suspend fun pollStatus(requestId: String) {
        // Ejecutar hasta 120 intentos cada 15s (30 minutos máximo para scraping masivo)
        repeat(120) { attempt ->
            runCatching { api.getStatus(requestId) }
                .onSuccess { result ->
                    when (result.status.lowercase()) {
                        "processing", "accepted", "waiting" -> Unit
                        "done" -> {
                            val processedData = processDetailedResults(result)
                            _ui.value = _ui.value.copy(
                                isPolling = false,
                                result = result,
                                error = null,
                                processedInteractions = processedData.processedInteractions,
                                summary = processedData.summary,
                                chartData = processedData.chartData,
                                targetGroupInteractions = processedData.targetGroupInteractions
                            )
                            return
                        }
                        "error" -> {
                            _ui.value = _ui.value.copy(
                                isPolling = false,
                                error = result.error ?: "Error reportado por el backend."
                            )
                            return
                        }
                    }
                }
                .onFailure { ex ->
                    val errorMsg = when (ex) {
                        is retrofit2.HttpException -> {
                            if (ex.code() == 404) "Error 404: Webhook no encontrado. ¿Flujo 'Active'?"
                            else "Error HTTP ${ex.code()}"
                        }
                        is java.net.ConnectException -> "No se pudo conectar con el servidor. Revisa tu internet."
                        else -> ex.localizedMessage ?: "Error desconocido"
                    }
                    // No detenemos el polling por un error temporal, pero informamos al usuario
                    _ui.value = _ui.value.copy(error = "Reintentando... ($errorMsg)")
                }
            delay(15_000)
        }
        _ui.value = _ui.value.copy(isPolling = false, error = "Tiempo de espera agotado (30min).")
    }

    private fun processDetailedResults(result: InteractionResult): ProcessedData {
        val detailed = result.detailedResults

        if (detailed == null) {
            // Fallback: procesar desde las listas simples de likes/comments
            return processLegacyResults(result)
        }

        // Procesar interacciones del target group
        val targetGroupNormalized = result.likes + result.comments
        val targetInteractions = detailed.interactions.filter { interaction ->
            targetGroupNormalized.any { it.equals(interaction.username, ignoreCase = true) }
        }

        // Crear lista procesada para la UI
        val processed = detailed.interactions.map { interaction ->
            ProcessedInteraction(
                username = interaction.username,
                displayName = interaction.displayName,
                isPrivate = interaction.isPrivate,
                isVerified = interaction.isVerified,
                gaveLike = interaction.gaveLike,
                commented = interaction.commented,
                commentText = interaction.commentText,
                totalInteractions = interaction.interactionCount
            )
        }.sortedByDescending { it.totalInteractions }

        // Preparar datos para la gráfica (solo usuarios del target group)
        val chartData = if (detailed.chartData.labels.isNotEmpty()) {
            detailed.chartData.labels.mapIndexed { index, label ->
                ChartEntry(
                    username = label,
                    likes = detailed.chartData.likes.getOrElse(index) { 0 },
                    comments = detailed.chartData.comments.getOrElse(index) { 0 },
                    total = detailed.chartData.total.getOrElse(index) { 0 }
                )
            }.sortedByDescending { it.total }
        } else {
            // Fallback: generar desde interacciones
            targetInteractions.map { interaction ->
                ChartEntry(
                    username = interaction.username,
                    likes = if (interaction.gaveLike) 1 else 0,
                    comments = if (interaction.commented) 1 else 0,
                    total = interaction.interactionCount
                )
            }.sortedByDescending { it.total }
        }

        return ProcessedData(
            processedInteractions = processed,
            summary = detailed.summary,
            chartData = chartData,
            targetGroupInteractions = targetInteractions
        )
    }

    private fun processLegacyResults(result: InteractionResult): ProcessedData {
        // Fallback para cuando no hay detailed_results
        val targetUsers = (result.likes + result.comments).distinct()

        val chartData = targetUsers.map { username ->
            ChartEntry(
                username = username,
                likes = if (result.likes.contains(username)) 1 else 0,
                comments = if (result.comments.contains(username)) 1 else 0,
                total = (if (result.likes.contains(username)) 1 else 0) +
                        (if (result.comments.contains(username)) 1 else 0)
            )
        }.sortedByDescending { it.total }

        val processed = targetUsers.map { username ->
            ProcessedInteraction(
                username = username,
                displayName = username,
                isPrivate = false,
                isVerified = false,
                gaveLike = result.likes.contains(username),
                commented = result.comments.contains(username),
                commentText = "",
                totalInteractions = (if (result.likes.contains(username)) 1 else 0) +
                                   (if (result.comments.contains(username)) 1 else 0)
            )
        }.sortedByDescending { it.totalInteractions }

        return ProcessedData(
            processedInteractions = processed,
            summary = null,
            chartData = chartData,
            targetGroupInteractions = emptyList()
        )
    }

    data class ProcessedData(
        val processedInteractions: List<ProcessedInteraction>,
        val summary: com.iha.test.linkinstareview.models.InteractionSummary?,
        val chartData: List<ChartEntry>,
        val targetGroupInteractions: List<UserInteraction>
    )
}
