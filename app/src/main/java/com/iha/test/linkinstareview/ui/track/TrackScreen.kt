package com.iha.test.linkinstareview.ui.track

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Divider
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.iha.test.linkinstareview.models.ChartEntry
import com.iha.test.linkinstareview.models.InteractionSummary
import com.iha.test.linkinstareview.models.ProcessedInteraction
import com.iha.test.linkinstareview.models.UserInteraction

@Composable
fun TrackScreen(vm: TrackViewModel) {
    val state by vm.ui.collectAsState()

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                "Instagram Tracker Alpha",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                "Rastreo quirúrgico de interacciones",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.secondary
            )
        }

        item {
            ElevatedCard(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Configuración", style = MaterialTheme.typography.titleMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = state.postUrl,
                        onValueChange = vm::onPostUrlChange,
                        label = { Text("URL de la publicación") },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("https://www.instagram.com/p/...") }
                    )
                }
            }
        }

        item {
            Text("Grupo Objetivo", style = MaterialTheme.typography.titleMedium)
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = state.newTargetUser,
                    onValueChange = vm::onNewTargetUserChange,
                    label = { Text("Usuario") },
                    modifier = Modifier.weight(1f),
                    prefix = { Text("@") }
                )
                Button(onClick = vm::addTargetUser, modifier = Modifier.height(56.dp)) {
                    Icon(Icons.Default.Add, contentDescription = null)
                }
            }
        }

        if (state.targetUsers.isNotEmpty()) {
            items(state.targetUsers) { user ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("@$user", fontWeight = FontWeight.Medium)
                        IconButton(onClick = { vm.removeTargetUser(user) }) {
                            Icon(Icons.Default.Close, contentDescription = "Quitar", modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
        } else {
            item {
                Text(
                    "Agregue usuarios para el grupo objetivo.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
                )
            }
        }

        item {
            Button(
                onClick = { vm.submit() },
                enabled = !state.isSubmitting && !state.isPolling,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = MaterialTheme.shapes.medium
            ) {
                if (state.isSubmitting) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color.White)
                } else {
                    Text("Iniciar Extracción de Datos")
                }
            }
        }

        if (state.isPolling) {
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Text("Procesando en n8n + Apify...", style = MaterialTheme.typography.bodyMedium)
                    Spacer(modifier = Modifier.height(8.dp))
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                    Text(
                        "Esto puede tardar hasta 30 min para posts virales.",
                        style = MaterialTheme.typography.labelSmall
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = { vm.cancelTracking() },
                        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
                            .run { ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer) },
                        modifier = Modifier.fillMaxWidth().height(48.dp)
                    ) {
                        Text("Cancelar Rastreo")
                    }
                }
            }
        }

        state.error?.let {
            item {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
                    }
                }
            }
        }

        // Privacy Restriction Message (MANDATORY)
        item {
            Surface(
                color = MaterialTheme.colorScheme.secondaryContainer,
                shape = MaterialTheme.shapes.medium,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Info, contentDescription = null)
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        state.savedMetricMessage,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                }
            }
        }

        // RESULTADOS DETALLADOS
        if (state.result != null && !state.isPolling) {
            item { HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp)) }

            // Resumen de estadísticas
            state.summary?.let { summary ->
                item {
                    StatisticsCard(summary)
                }
            }

            // Gráfica de barras
            if (state.chartData.isNotEmpty()) {
                item {
                    BarChartCard(state.chartData)
                }
            }

            // Lista detallada de interacciones
            if (state.processedInteractions.isNotEmpty()) {
                item {
                    DetailedInteractionsList(
                        interactions = state.processedInteractions,
                        title = "Todas las Interacciones"
                    )
                }
            }

            // Interacciones del grupo objetivo
            if (state.targetGroupInteractions.isNotEmpty()) {
                item {
                    DetailedInteractionsCard(
                        interactions = state.targetGroupInteractions,
                        title = "Interacciones del Grupo Objetivo"
                    )
                }
            }

            // Resultados legacy (fallback)
            if (state.processedInteractions.isEmpty()) {
                item { ResultCategory("Likes Detectados", state.result?.likes ?: emptyList()) }
                item { ResultCategory("Comentarios Detectados", state.result?.comments ?: emptyList()) }
                item { ResultCategory("Reposts Detectados (Perfiles)", state.result?.reposts ?: emptyList()) }
            }
        }
    }
}

@Composable
private fun StatisticsCard(summary: InteractionSummary) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "Resumen de Interacciones",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                StatItem(
                    icon = Icons.Default.Favorite,
                    value = summary.totalLikes.toString(),
                    label = "Likes",
                    color = Color(0xFFE91E63)
                )
                StatItem(
                    icon = Icons.Default.Check,
                    value = summary.totalComments.toString(),
                    label = "Comentarios",
                    color = Color(0xFF4CAF50)
                )
                StatItem(
                    value = summary.uniqueUsers.toString(),
                    label = "Usuarios",
                    color = MaterialTheme.colorScheme.primary
                )
            }

            Spacer(modifier = Modifier.height(12.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                StatItem(
                    icon = Icons.Default.Person,
                    value = summary.privateAccounts.toString(),
                    label = "Privados",
                    color = Color(0xFFFF9800)
                )
                StatItem(
                    icon = Icons.Default.Star,
                    value = summary.verifiedAccounts.toString(),
                    label = "Verificados",
                    color = Color(0xFF2196F3)
                )
            }
        }
    }
}

@Composable
private fun StatItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
    value: String,
    label: String,
    color: Color
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(24.dp))
            Spacer(modifier = Modifier.height(4.dp))
        }
        Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = color)
        Text(label, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun BarChartCard(chartData: List<ChartEntry>) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                "Gráfica de Interacciones",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Text(
                "Likes (rosa) vs Comentarios (verde)",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline
            )
            Spacer(modifier = Modifier.height(16.dp))

            // Limitar a los top 10 para la gráfica
            val topData = chartData.take(10)
            val maxValue = (topData.maxOfOrNull { it.total } ?: 1).coerceAtLeast(1)

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                topData.forEach { entry ->
                    BarChartItem(entry = entry, maxValue = maxValue)
                }
            }
        }
    }
}

@Composable
private fun BarChartItem(entry: ChartEntry, maxValue: Int) {
    val animatedProgress by animateFloatAsState(
        targetValue = entry.total.toFloat() / maxValue.toFloat(),
        label = "bar_animation"
    )

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth()
    ) {
        // Username
        Text(
            text = "@${entry.username}",
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.width(100.dp),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        Spacer(modifier = Modifier.width(8.dp))

        // Barras
        Column(modifier = Modifier.weight(1f)) {
            // Barra de likes (rosa)
            if (entry.likes > 0) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(entry.likes.toFloat() / maxValue.toFloat())
                        .height(12.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Color(0xFFE91E63))
                )
            }
            // Barra de comentarios (verde) - apilada
            if (entry.comments > 0) {
                Spacer(modifier = Modifier.height(2.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth(entry.comments.toFloat() / maxValue.toFloat())
                        .height(12.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Color(0xFF4CAF50))
                )
            }
            // Fondo gris para el total
            Box(
                modifier = Modifier
                    .fillMaxWidth(animatedProgress)
                    .height(2.dp)
                    .background(Color.Transparent)
            )
        }

        Spacer(modifier = Modifier.width(8.dp))

        // Total
        Text(
            text = entry.total.toString(),
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.width(24.dp)
        )
    }
}

@Composable
private fun DetailedInteractionsList(
    interactions: List<ProcessedInteraction>,
    title: String
) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))

            // Mostrar top 20 interacciones
            interactions.take(20).forEach { interaction ->
                InteractionRow(interaction)
                HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            }

            if (interactions.size > 20) {
                Text(
                    "... y ${interactions.size - 20} usuarios más",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
        }
    }
}

@Composable
private fun InteractionRow(interaction: ProcessedInteraction) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
    ) {
        // Avatar placeholder
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = interaction.username.take(1).uppercase(),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        // User info
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "@${interaction.username}",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium
            )
            if (interaction.displayName.isNotBlank() && interaction.displayName != interaction.username) {
                Text(
                    interaction.displayName,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
                )
            }
        }

        // Badges
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            if (interaction.isPrivate) {
                Badge(text = "Privado", color = Color(0xFFFF9800))
            }
            if (interaction.isVerified) {
                Badge(text = "✓ Verif", color = Color(0xFF2196F3))
            }
            if (interaction.gaveLike) {
                Badge(text = "❤ Like", color = Color(0xFFE91E63))
            }
            if (interaction.commented) {
                Badge(text = "💬", color = Color(0xFF4CAF50))
            }
        }
    }

    // Comment text if exists
    if (interaction.commented && interaction.commentText.isNotBlank()) {
        Text(
            text = "\"${interaction.commentText}\"",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.outline,
            modifier = Modifier.padding(start = 52.dp, top = 4.dp, bottom = 4.dp)
        )
    }
}

@Composable
private fun DetailedInteractionsCard(
    interactions: List<UserInteraction>,
    title: String
) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.elevatedCardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onTertiaryContainer
            )
            Spacer(modifier = Modifier.height(8.dp))

            interactions.forEach { interaction ->
                DetailedUserInteractionRow(interaction)
                HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
            }
        }
    }
}

@Composable
private fun DetailedUserInteractionRow(interaction: UserInteraction) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
    ) {
        // Avatar placeholder
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = interaction.username.take(1).uppercase(),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        // User info
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "@${interaction.username}",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium
                )
                if (interaction.isVerified) {
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(
                        Icons.Default.Star,
                        contentDescription = "Verificado",
                        tint = Color(0xFF2196F3),
                        modifier = Modifier.size(14.dp)
                    )
                }
            }

            // Acciones
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (interaction.gaveLike) {
                    Text(
                        "❤ Like",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFFE91E63)
                    )
                }
                if (interaction.commented) {
                    Text(
                        "💬 Comentó",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF4CAF50)
                    )
                }
            }
        }

        // Badges adicionales
        if (interaction.isPrivate) {
            Badge(text = "Privado", color = Color(0xFFFF9800))
        }
    }

    // Comment text if exists
    if (interaction.commented && interaction.commentText.isNotBlank()) {
        Text(
            text = "\"${interaction.commentText}\"",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onTertiaryContainer.copy(alpha = 0.7f),
            modifier = Modifier.padding(start = 52.dp, top = 4.dp, bottom = 4.dp)
        )
    }
}

@Composable
private fun Badge(text: String, color: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(4.dp))
            .background(color.copy(alpha = 0.2f))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun ResultCategory(title: String, users: List<String>) {
    Column {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        if (users.isEmpty()) {
            Text("Sin coincidencias en el grupo objetivo.", style = MaterialTheme.typography.bodySmall)
        } else {
            users.forEach { user ->
                Text("• @$user", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 8.dp))
            }
        }
        Spacer(modifier = Modifier.height(12.dp))
    }
}
