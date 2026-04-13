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
        // datadoping/instagram-likes-scraper (expects snake_case)
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

    if (String(actorId).includes('datadoping/instagram-likes-scraper')) {
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

    if (String(actorId).includes('apify/instagram-comment-scraper')) {
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

    if (String(actorId).includes('apify/instagram-api-scraper')) {
        const variants = [
            { directUrls: [postUrl], resultsType: 'comments', resultsLimit: commentsLimit },
            { directUrls: [postUrl], resultsLimit: commentsLimit },
            { startUrls: [postUrl], resultsType: 'comments', resultsLimit: commentsLimit }
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

const extractUsernames = (item) => {
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

        push(node.username);
        push(node.userName);
        push(node.ownerUsername);
        push(node.user?.username);
        push(node.owner?.username);

        if (typeof node.text === 'string') {
            const mentions = node.text.match(/@(\w+)/g) || [];
            mentions.forEach((m) => push(m));
        }

        walk(node.comments);
        walk(node.topComments);
        walk(node.latestComments);
        walk(node.likes);
        walk(node.likers);
    };

    walk(item);
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
            'datadoping/instagram-likes-scraper'
        ]);
        const commentsActorIds = parseActorIds(process.env.APIFY_COMMENTS_ACTOR_IDS || process.env.APIFY_COMMENTS_ACTOR_ID, [
            'apify/instagram-comment-scraper',
            'apify/instagram-api-scraper'
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
            diagnostics: trackRequest.diagnostics || { likes: '', comments: '' }
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
            const foundUsers = items
                .flatMap((i) => extractUsernames(i))
                .filter((n) => n.length > 0);
            const datasetError = extractDatasetErrorMessage(items);

            console.log(`[Webhook] Extracted ${foundUsers.length} potential usernames from items.`);
            if (datasetError) {
                console.warn(`[Webhook] Dataset reported issue: ${datasetError}`);
            }

            const filteredResults = trackRequest.targetGroup.filter((u, i) => foundUsers.includes(targetNorm[i]));
            console.log(`[Webhook] Filtered matches for targetGroup: ${filteredResults.length}`);

            // In default payload, actId and id are in data (resource)
            const actId = data.actId || data.actorId;
            const runId = data.id || data.actorRunId || resource?.id;

            const isLikes = (actId?.includes('likes-scraper') || trackRequest.likesRunId === runId);
            
            if (isLikes) {
                trackRequest.results.likes = filteredResults;
                if (datasetError) trackRequest.diagnostics.likes = datasetError;
            } else {
                trackRequest.results.comments = filteredResults;
                if (datasetError) trackRequest.diagnostics.comments = datasetError;
            }

            // Check if BOTH are now present (or we can just keep adding)
            // Simplified logic: If we have at least once received a success for each type, or if we just want to update as they come.
            // To be robust, we'll mark as 'ready' only after we have both, but for now we'll allow partial results and update status.
            
            // If the other run ID exists and we are the second one to finish, mark as ready.
            // This is a bit tricky with concurrent runs, but usually one follows the other.
            
            // For now, let's mark as ready if we have processed both.
            // We can check if both results fields are populated (even if empty array).
            
            // Wait, we need a way to know if it's the second of the two actors.
            // We'll add a flag or check if both run IDs have a corresponding status.
            // Since Apify doesn't tell us "this was the second one", we'll track which ones finished.
            
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
