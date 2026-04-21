const express = require('express');
const router = express.Router();
const TrackRequest = require('../models/TrackRequest');
const { triggerActor, getDatasetItems } = require('../services/apifyService');

// Normalize username
const norm = (u) => String(u || '').toLowerCase().replace(/[@.\s]/g, '').trim();

const parseActorIds = (envValue, defaults) => {
    const parsed = String(envValue || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    return parsed.length ? parsed : defaults;
};

const normalizePostUrl = (rawUrl) => {
    const clean = String(rawUrl || '').split('?')[0].trim();
    if (!clean) return clean;
    return clean.endsWith('/') ? clean : `${clean}/`;
};

const extractPostCode = (postUrl) => {
    const m = String(postUrl || '').match(/instagram\.com\/(?:p|reel)\/([^/?#]+)/i);
    return m?.[1] || '';
};

const buildProxyConfiguration = () => {
    const group = String(process.env.APIFY_PROXY_GROUP || '').trim();
    const countryCode = String(process.env.APIFY_PROXY_COUNTRY || '').trim().toUpperCase();

    if (!group) return null;

    const cfg = {
        useApifyProxy: true,
        apifyProxyGroups: [group]
    };

    if (countryCode) cfg.apifyProxyCountry = countryCode;
    return cfg;
};

const getPositiveIntFromEnv = (name, fallback) => {
    const raw = Number(process.env[name]);
    return Number.isInteger(raw) && raw > 0 ? raw : fallback;
};

const likesInputCandidates = (actorId, postUrl, proxyConfiguration) => {
    const postCode = extractPostCode(postUrl);
    const likesLimit = getPositiveIntFromEnv('APIFY_LIKES_MAX_COUNT', 80);
    const base = [
        // data-slayer/instagram-likes (expects snake_case)
        { posts: [postUrl], max_count: likesLimit },
        // Some community actors use camelCase
        { posts: [postUrl], maxCount: likesLimit },
        // Retry using shortcode instead of URL (some runs get blocked on full URL)
        ...(postCode ? [{ posts: [postCode], max_count: likesLimit }, { posts: [postCode], maxCount: likesLimit }] : []),
        // Some likes actors use startUrls as strings
        { startUrls: [postUrl], maxCount: likesLimit },
        // Some likes actors use startUrls as objects
        { startUrls: [{ url: postUrl }], maxCount: likesLimit }
    ];

    if (String(actorId).includes('data-slayer/instagram-likes')) {
        const variants = [
            { posts: [postUrl], max_count: likesLimit },
            { posts: [postUrl], maxCount: likesLimit },
            ...(postCode ? [{ posts: [postCode], max_count: likesLimit }, { posts: [postCode], maxCount: likesLimit }] : []),
            { startUrls: [postUrl], maxCount: likesLimit },
            { startUrls: [{ url: postUrl }], maxCount: likesLimit }
        ];
        return proxyConfiguration
            ? variants.map((v) => ({ ...v, proxyConfiguration }))
            : variants;
    }

    return proxyConfiguration
        ? base.map((v) => ({ ...v, proxyConfiguration }))
        : base;
};

const commentsInputCandidates = (actorId, postUrl, proxyConfiguration) => {
    const commentsLimit = getPositiveIntFromEnv('APIFY_COMMENTS_RESULTS_LIMIT', 120);

    if (String(actorId).includes('apify/instagram-scraper')) {
        const variants = [
            {
                directUrls: [postUrl],
                resultsLimit: commentsLimit,
                isNewestComments: false,
                includeNestedComments: false
            },
            { directUrls: [postUrl], resultsLimit: commentsLimit },
            { startUrls: [postUrl], resultsLimit: commentsLimit }
        ];
        return proxyConfiguration
            ? variants.map((v) => ({ ...v, proxyConfiguration }))
            : variants;
    }

    const variants = [
        { directUrls: [postUrl], resultsLimit: commentsLimit },
        { startUrls: [postUrl], resultsLimit: commentsLimit },
        { startUrls: [{ url: postUrl }], resultsLimit: commentsLimit }
    ];
    return proxyConfiguration
        ? variants.map((v) => ({ ...v, proxyConfiguration }))
        : variants;
};

const startActorWithFallback = async (label, actorIds, inputFactory, webhookUrl, postUrl, proxyConfiguration) => {
    let lastError = null;

    for (const actorId of actorIds) {
        for (const input of inputFactory(actorId, postUrl, proxyConfiguration)) {
            try {
                console.log(`[${label}] Trying actor ${actorId} with input keys: ${Object.keys(input).join(', ')}`);
                const run = await triggerActor(actorId, input, webhookUrl);
                return run;
            } catch (err) {
                lastError = err;
                console.warn(`[${label}] Failed actor ${actorId} with keys ${Object.keys(input).join(', ')}. Error: ${err.message}`);
            }
        }
    }

    throw lastError || new Error(`Unable to start ${label} actor with any known config`);
};

const extractUsernames = (item, isLikesActor = false) => {
    const out = new Set();

    const push = (value) => {
        const n = norm(value);
        if (n) out.add(n);
    };

    const walk = (node) => {
        if (!node) return;

        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }

        if (typeof node !== 'object') return;

        // Campos comunes para likes y comentarios
        push(node.username);
        push(node.userName);
        push(node.ownerUsername);
        push(node.user?.username);
        push(node.owner?.username);

        // Para likes: el actor data-slayer/instagram-likes devuelve usuarios directamente
        if (isLikesActor) {
            // El item ya es un usuario con username, no necesita más
            return;
        }

        // Para comentarios: extraer menciones del texto
        if (typeof node.text === 'string') {
            const mentions = node.text.match(/@(\w+)/g) || [];
            mentions.forEach((m) => push(m));
        }

        // Navegar estructuras anidadas
        walk(node.comments);
        walk(node.topComments);
        walk(node.latestComments);
        walk(node.likes);
        walk(node.likers);
    };

    walk(item);
    return Array.from(out);
};

// Función específica para extraer usernames de comentarios del actor apify/instagram-scraper
const extractCommentUsernames = (postItem) => {
    const out = new Set();

    const push = (value) => {
        const n = norm(value);
        if (n) out.add(n);
    };

    // El actor apify/instagram-scraper devuelve el post con comentarios anidados
    // Los comentarios están en latestComments (array) o firstComment (string)
    if (!postItem) return [];

    // Extraer de latestComments (array de objetos de comentario)
    if (Array.isArray(postItem.latestComments)) {
        postItem.latestComments.forEach(comment => {
            if (comment.ownerUsername) push(comment.ownerUsername);
            if (comment.username) push(comment.username);
            if (comment.user?.username) push(comment.user.username);
            if (comment.owner?.username) push(comment.owner.username);

            // Extraer menciones del texto del comentario
            if (typeof comment.text === 'string') {
                const mentions = comment.text.match(/@(\w+)/g) || [];
                mentions.forEach((m) => push(m));
            }
        });
    }

    // Extraer de firstComment si es un objeto
    if (postItem.firstComment && typeof postItem.firstComment === 'object') {
        const comment = postItem.firstComment;
        if (comment.ownerUsername) push(comment.ownerUsername);
        if (comment.username) push(comment.username);
        if (typeof comment.text === 'string') {
            const mentions = comment.text.match(/@(\w+)/g) || [];
            mentions.forEach((m) => push(m));
        }
    }

    // Extraer de comments si existe como array
    if (Array.isArray(postItem.comments)) {
        postItem.comments.forEach(comment => {
            if (comment.ownerUsername) push(comment.ownerUsername);
            if (comment.username) push(comment.username);
            if (comment.user?.username) push(comment.user.username);
            if (typeof comment.text === 'string') {
                const mentions = comment.text.match(/@(\w+)/g) || [];
                mentions.forEach((m) => push(m));
            }
        });
    }

    return Array.from(out);
};

const extractDatasetErrorMessage = (items) => {
    if (!Array.isArray(items) || items.length === 0) return '';

    const messages = items
        .flatMap((it) => {
            const row = [];
            if (typeof it?.errorDescription === 'string') row.push(it.errorDescription);
            if (typeof it?.error === 'string') row.push(it.error);
            if (Array.isArray(it?.requestErrorMessages)) row.push(...it.requestErrorMessages);
            return row;
        })
        .filter(Boolean);

    return messages.length ? Array.from(new Set(messages)).join(' | ') : '';
};

// Extraer información detallada de likes (usuario completo)
const extractDetailedLikes = (items) => {
    const users = [];

    items.forEach(item => {
        const user = {
            username: norm(item.username || ''),
            displayName: item.full_name || item.username || '',
            profilePicUrl: item.profile_pic_url || '',
            isPrivate: item.is_private || false,
            isVerified: item.is_verified || false,
            gaveLike: true,
            commented: false,
            commentText: '',
            likeDate: new Date(),
            interactionCount: 1
        };

        if (user.username) {
            users.push(user);
        }
    });

    return users;
};

// Extraer información detallada de comentarios
const extractDetailedComments = (postItem) => {
    const users = [];

    if (!postItem) return users;

    const extractFromComment = (comment) => {
        return {
            username: norm(comment.ownerUsername || comment.username || comment.user?.username || ''),
            displayName: comment.ownerFullName || comment.user?.full_name || '',
            profilePicUrl: comment.ownerProfilePicUrl || comment.user?.profile_pic_url || '',
            isPrivate: comment.isPrivate || comment.user?.is_private || false,
            isVerified: comment.isVerified || comment.user?.is_verified || false,
            gaveLike: false,
            commented: true,
            commentText: comment.text || '',
            commentDate: comment.timestamp ? new Date(comment.timestamp * 1000) : new Date(),
            interactionCount: 1
        };
    };

    // Extraer de latestComments
    if (Array.isArray(postItem.latestComments)) {
        postItem.latestComments.forEach(comment => {
            const user = extractFromComment(comment);
            if (user.username) users.push(user);
        });
    }

    // Extraer de firstComment
    if (postItem.firstComment && typeof postItem.firstComment === 'object') {
        const user = extractFromComment(postItem.firstComment);
        if (user.username) users.push(user);
    }

    // Extraer de comments
    if (Array.isArray(postItem.comments)) {
        postItem.comments.forEach(comment => {
            const user = extractFromComment(comment);
            if (user.username) users.push(user);
        });
    }

    return users;
};

// Generar datos para la gráfica de barras
const generateChartData = (interactions, targetGroup) => {
    const data = {};

    // Inicializar todos los usuarios del target group con 0
    targetGroup.forEach(username => {
        const normalized = norm(username);
        data[normalized] = {
            username: username,
            likes: 0,
            comments: 0,
            total: 0
        };
    });

    // Agregar interacciones
    interactions.forEach(interaction => {
        const normalized = interaction.username;
        if (data[normalized]) {
            if (interaction.gaveLike) data[normalized].likes++;
            if (interaction.commented) data[normalized].comments++;
            data[normalized].total = data[normalized].likes + data[normalized].comments;
        }
    });

    // Convertir a arrays para Chart.js
    const sortedEntries = Object.values(data).sort((a, b) => b.total - a.total);

    return {
        labels: sortedEntries.map(e => e.username),
        likes: sortedEntries.map(e => e.likes),
        comments: sortedEntries.map(e => e.comments),
        total: sortedEntries.map(e => e.total)
    };
};

// Combinar interacciones de likes y comentarios
const mergeInteractions = (likesInteractions, commentsInteractions) => {
    const merged = {};

    // Agregar likes
    likesInteractions.forEach(like => {
        if (like.username) {
            merged[like.username] = { ...like };
        }
    });

    // Agregar o mezclar comentarios
    commentsInteractions.forEach(comment => {
        if (comment.username) {
            if (merged[comment.username]) {
                // Usuario ya existe por un like
                merged[comment.username].commented = true;
                merged[comment.username].commentText = comment.commentText;
                merged[comment.username].commentDate = comment.commentDate;
                merged[comment.username].interactionCount++;
            } else {
                // Nuevo usuario que solo comentó
                merged[comment.username] = { ...comment };
            }
        }
    });

    return Object.values(merged);
};

router.post('/start', async (req, res) => {
    try {
        console.log('Incoming request to /start:', req.body);
        let { request_id, post_url, target_group } = req.body;
        
        if (!request_id || !post_url) {
            return res.status(400).json({ error: 'Missing request_id or post_url' });
        }

        post_url = normalizePostUrl(post_url);
        console.log('Cleaned Post URL for Apify:', post_url);

        // 1. Create entry in MongoDB
        const trackRequest = new TrackRequest({
            requestId: request_id,
            postUrl: post_url,
            targetGroup: target_group || [],
            status: 'processing',
            results: { likes: [], comments: [], reposts: [] },
            diagnostics: { likes: '', comments: '' },
            finishedRuns: []
        });
        await trackRequest.save();

        // 2. Trigger Apify Actors
        const webhookUrl = `${process.env.PUBLIC_URL}/api/track/webhook?requestId=${request_id}`;
        const likesActorIds = parseActorIds(process.env.APIFY_LIKES_ACTOR_IDS || process.env.APIFY_LIKES_ACTOR_ID, [
            'data-slayer/instagram-likes'
        ]);
        const commentsActorIds = parseActorIds(process.env.APIFY_COMMENTS_ACTOR_IDS || process.env.APIFY_COMMENTS_ACTOR_ID, [
            'apify/instagram-scraper'
        ]);
        const proxyConfiguration = buildProxyConfiguration();
        if (proxyConfiguration) {
            console.log(`[Start] Using Apify proxy group(s): ${proxyConfiguration.apifyProxyGroups.join(', ')}`);
        }
        
        const likesRun = await startActorWithFallback(
            'Likes',
            likesActorIds,
            likesInputCandidates,
            webhookUrl,
            post_url,
            proxyConfiguration
        );

        const commentsRun = await startActorWithFallback(
            'Comments',
            commentsActorIds,
            commentsInputCandidates,
            webhookUrl,
            post_url,
            proxyConfiguration
        );

        // 3. Update Run IDs in DB
        trackRequest.likesRunId = likesRun.id;
        trackRequest.commentsRunId = commentsRun.id;
        await trackRequest.save();

        res.status(202).json({ status: 'accepted', version: '2.0-express' });
    } catch (error) {
        console.error('Error in /start:', error);
        res.status(500).json({ 
            error: 'Internal Server Error', 
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// GET /ig-track/status/:requestId
router.get('/status/:requestId', async (req, res) => {
    try {
        const { requestId } = req.params;
        const trackRequest = await TrackRequest.findOne({ requestId });

        if (!trackRequest) {
            return res.status(404).json({ status: 'not_found' });
        }

        if (trackRequest.status === 'processing') {
             return res.json({ 
                status: 'processing', 
                request_id: requestId,
                info: 'Data is being scraped and processed'
            });
        }

        if (trackRequest.status === 'failed') {
            return res.json({
                status: 'failed',
                request_id: requestId,
                error: trackRequest.error,
                diagnostics: trackRequest.diagnostics || { likes: '', comments: '' }
            });
        }

        // If ready, return the results
        res.json({
            status: 'done',
            request_id: requestId,
            post_url: trackRequest.postUrl,
            likes: trackRequest.results.likes,
            comments: trackRequest.results.comments,
            reposts: trackRequest.results.reposts || [],
            diagnostics: trackRequest.diagnostics || { likes: '', comments: '' },
            // Nuevos campos con información detallada
            detailed_results: trackRequest.detailedResults || {
                interactions: [],
                summary: { totalLikes: 0, totalComments: 0, uniqueUsers: 0, privateAccounts: 0, verifiedAccounts: 0 },
                chartData: { labels: [], likes: [], comments: [], total: [] }
            }
        });
    } catch (error) {
        console.error('Error in /status:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/track/webhook
router.post('/webhook', async (req, res) => {
    try {
        const { requestId } = req.query;
        // Apify default payload uses eventType and eventData (or resource)
        const { eventType, eventData, resource } = req.body;
        
        // Use eventType or fallback to event
        const event = eventType || req.body.event;
        // Use resource or eventData or fallback to data
        const data = resource || eventData || req.body.data;

        console.log(`Webhook received for requestId: ${requestId}, event: ${event}`);
        
        if (!requestId) return res.status(400).send('Missing requestId');

        const trackRequest = await TrackRequest.findOne({ requestId });
        if (!trackRequest) {
            return res.status(404).json({ error: 'Track request not found' });
        }

        if (event === 'ACTOR.RUN.FAILED' || event === 'ACTOR.RUN.ABORTED') {
            trackRequest.status = 'failed';
            trackRequest.error = `Apify actor run failed: ${event}`;
            await trackRequest.save();
            return res.status(200).send('OK');
        }

        if (event === 'ACTOR.RUN.SUCCEEDED') {
            const datasetId = data.defaultDatasetId;
            if (!datasetId) {
                console.error('No datasetId found in webhook data');
                return res.status(200).send('OK');
            }

            const items = await getDatasetItems(datasetId);
            console.log(`[Webhook] Fetched ${items.length} items from Apify dataset ${datasetId}`);

            if (items.length > 0) {
                console.log(`[Webhook] First item keys: ${Object.keys(items[0]).join(', ')}`);
                console.log(`[Webhook] First item sample: ${JSON.stringify(items[0]).substring(0, 200)}...`);
            }

            const targetNorm = trackRequest.targetGroup.map(u => norm(u));
            console.log(`[Webhook] Target users (normalized): ${JSON.stringify(targetNorm)}`);

            // Determinar si es el actor de likes o comentarios
            const actId = data.actId || data.actorId || '';
            const runId = data.id || data.actorRunId || resource?.id;
            const isLikesActor = actId.includes('likes') || trackRequest.likesRunId === runId;

            let foundUsers = [];
            let detailedInteractions = [];

            if (isLikesActor) {
                // Likes: cada item es un usuario que dio like
                foundUsers = items
                    .flatMap((i) => extractUsernames(i, true))
                    .filter((n) => n.length > 0);
                console.log(`[Webhook] Likes actor: extracted ${foundUsers.length} usernames from ${items.length} items`);
                console.log(`[Webhook] Sample likes usernames (first 10): ${JSON.stringify(foundUsers.slice(0, 10))}`);

                // Extraer información detallada de likes
                detailedInteractions = extractDetailedLikes(items);
                console.log(`[Webhook] Detailed likes info extracted: ${detailedInteractions.length} users`);
            } else {
                // Comentarios: el actor apify/instagram-scraper devuelve el post con comentarios anidados
                // Normalmente solo 1 item (el post) con los comentarios dentro
                foundUsers = items
                    .flatMap((postItem) => extractCommentUsernames(postItem))
                    .filter((n) => n.length > 0);
                console.log(`[Webhook] Comments actor: extracted ${foundUsers.length} usernames from ${items.length} post items`);
                console.log(`[Webhook] Comments usernames: ${JSON.stringify(foundUsers)}`);

                // Extraer información detallada de comentarios (del primer item, que es el post)
                if (items.length > 0) {
                    detailedInteractions = extractDetailedComments(items[0]);
                    console.log(`[Webhook] Detailed comments info extracted: ${detailedInteractions.length} users`);
                }
            }

            const datasetError = extractDatasetErrorMessage(items);

            if (datasetError) {
                console.warn(`[Webhook] Dataset reported issue: ${datasetError}`);
            }

            // Debug: mostrar qué usernames coinciden
            const matchedUsers = targetNorm.filter(tn => foundUsers.includes(tn));
            console.log(`[Webhook] Matched normalized usernames: ${JSON.stringify(matchedUsers)}`);

            const filteredResults = trackRequest.targetGroup.filter((u, i) => foundUsers.includes(targetNorm[i]));
            console.log(`[Webhook] Filtered matches for targetGroup: ${filteredResults.length}`);

            // isLikes ya fue determinado arriba, reutilizar esa variable
            const isLikes = isLikesActor;

            if (isLikes) {
                trackRequest.results.likes = filteredResults;
                if (datasetError) trackRequest.diagnostics.likes = datasetError;
                // Guardar interacciones de likes (temporalmente)
                trackRequest._tempLikesInteractions = detailedInteractions;
            } else {
                trackRequest.results.comments = filteredResults;
                if (datasetError) trackRequest.diagnostics.comments = datasetError;
                // Guardar interacciones de comentarios (temporalmente)
                trackRequest._tempCommentsInteractions = detailedInteractions;
            }
            
            if (trackRequest.results.likes.length >= 0 && trackRequest.results.comments.length >= 0) {
                 // Check if both run IDs have been "processed"
                 // Actually, let's just mark as ready if we receive results for either, 
                 // and the APP can poll until it's done.
                 // But the user wants it to be "resilient".
                 
                 // Let's add a `processedActors` array to the schema or just check the runId matches.
                 // Better: Mark as ready only if we have received a webhook for both.
                 
                 // I'll update the schema to include `finishedRuns` array.
                 if (!trackRequest.finishedRuns) trackRequest.finishedRuns = [];
                 if (!trackRequest.finishedRuns.includes(data.id)) {
                     trackRequest.finishedRuns.push(data.id);
                 }

                 if (trackRequest.finishedRuns.length >= 2) {
                     // Combinar interacciones de likes y comentarios
                     const likesInteractions = trackRequest._tempLikesInteractions || [];
                     const commentsInteractions = trackRequest._tempCommentsInteractions || [];
                     const mergedInteractions = mergeInteractions(likesInteractions, commentsInteractions);

                     // Calcular resumen
                     const summary = {
                         totalLikes: mergedInteractions.filter(i => i.gaveLike).length,
                         totalComments: mergedInteractions.filter(i => i.commented).length,
                         uniqueUsers: mergedInteractions.length,
                         privateAccounts: mergedInteractions.filter(i => i.isPrivate).length,
                         verifiedAccounts: mergedInteractions.filter(i => i.isVerified).length
                     };

                     // Generar datos para la gráfica
                     const chartData = generateChartData(mergedInteractions, trackRequest.targetGroup);

                     // Guardar resultados detallados
                     trackRequest.detailedResults = {
                         interactions: mergedInteractions,
                         summary: summary,
                         chartData: chartData
                     };

                     // Limpiar variables temporales
                     trackRequest._tempLikesInteractions = undefined;
                     trackRequest._tempCommentsInteractions = undefined;

                     console.log(`[Webhook] Detailed results saved: ${mergedInteractions.length} total interactions`);
                     console.log(`[Webhook] Summary:`, summary);
                     console.log(`[Webhook] Chart data ready: ${chartData.labels.length} users`);

                     const noMatches = (trackRequest.results.likes.length + trackRequest.results.comments.length) === 0;
                     const hasDiagnostics = Boolean(trackRequest.diagnostics?.likes || trackRequest.diagnostics?.comments);
                     if (noMatches && hasDiagnostics) {
                         trackRequest.status = 'failed';
                         trackRequest.error = `No interaction data available. Likes: ${trackRequest.diagnostics.likes || 'no details'}. Comments: ${trackRequest.diagnostics.comments || 'no details'}.`;
                     } else {
                         trackRequest.status = 'ready';
                     }
                 }
            }

            await trackRequest.save();
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error('Error in /webhook:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /ig-track/test-apify
router.get('/test-apify', async (req, res) => {
    try {
        const { triggerActor } = require('../services/apifyService');
        // Just try to see if the client can list actors or something simple
        res.json({ message: 'Apify connection test endpoint' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
