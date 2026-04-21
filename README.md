# LinkInstaReview

Sistema Android + n8n + Apify para rastrear interacción de un grupo objetivo sobre un post de Instagram.

## Lo que ya está implementado

- App Android (Kotlin + Compose + Room + Retrofit)
  - Gestión local del grupo objetivo (agregar/quitar usernames)
  - Envío de `request_id`, `post_url`, `target_group` al webhook de n8n
  - Polling asíncrono a endpoint de estado
  - Render de resultados por: likes, comentarios, reposts
  - Mensaje fijo de guardados inaccesibles

- n8n
  - `n8n/workflow-importable.json`: flujo base importable con `start/status`
  - `n8n/code-node-intersection.js`: script robusto para nodo Code
  - `n8n/workflow-outline.json`: mapa conceptual de nodos

## Configuración Android

1. Abrir proyecto en Android Studio.
2. En `app/build.gradle.kts`, editar:
   - `N8N_BASE_URL` con tu URL pública de n8n, terminando en `/`.
3. Sincronizar Gradle.
4. Ejecutar app en emulador/dispositivo.

## Configuración n8n

1. Importa `n8n/workflow-importable.json`.
2. Publica endpoints:
   - `POST /ig-track/start`
   - `GET /ig-track/status/:request_id`
3. Agrega variable de entorno en n8n:
   - `APIFY_TOKEN=...`
4. Añade/expande nodos HTTP para actors Apify y pega el script de `n8n/code-node-intersection.js` en el nodo Code de intersección.

## Restricción crítica (ya contemplada)

`Métrica de guardados inaccesible debido a las restricciones de privacidad de la plataforma`

No se implementa scraping de guardados.

## Paquetes principales

- `com.iha.test.linkinstareview.data.local`
- `com.iha.test.linkinstareview.data.remote`
- `com.iha.test.linkinstareview.models`
- `com.iha.test.linkinstareview.ui.track`

## Nota de compilación

Si `JAVA_HOME` falla, usa JDK embebido de Android Studio:

`C:\Program Files\Android\Android Studio\jbr`
