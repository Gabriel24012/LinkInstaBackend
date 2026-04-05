const express = require('express');
const router = express.Router();
const TrackRequest = require('../models/TrackRequest');
const { triggerActor, getDatasetItems } = require('../services/apifyService');

// Normalize username
const norm = (u) => String(u || '').toLowerCase().replace(/[@.\s]/g, '').trim();

// Extract username from different Apify dataset structures
const extractUsername = (i) => {
    return i.username || i.userName || i.ownerUsername || i.user?.username || i.owner?.username || '';
};

router.post('/start', async (req, res) => {
    try {
        console.log('Incoming request to /start:', req.body);
        let { request_id, post_url, target_group } = req.body;
        
        if (!request_id || !post_url) {
            return res.status(400).json({ error: 'Missing request_id or post_url' });
        }

        // Clean post_url: Remove query parameters like ?igsh=...
        if (post_url.includes('?')) {
            post_url = post_url.split('?')[0];
            if (!post_url.endsWith('/')) post_url += '/';
        }
        console.log('Cleaned Post URL for Apify:', post_url);

        // 1. Create entry in MongoDB
        const trackRequest = new TrackRequest({
            requestId: request_id,
            postUrl: post_url,
            targetGroup: target_group || [],
            status: 'processing',
            results: { likes: [], comments: [], reposts: [] },
            finishedRuns: []
        });
        await trackRequest.save();

        // 2. Trigger Apify Actors
        const webhookUrl = `${process.env.PUBLIC_URL}/api/track/webhook?requestId=${request_id}`;
        
        // Likes Scraper (Official Apify Actor for Likes)
        const likesRun = await triggerActor('apify/instagram-likes-scraper', {
            startUrls: [{ url: post_url }],
            maxCount: 200
        }, webhookUrl);

        // Comments Scraper
        const commentsRun = await triggerActor('apify/instagram-comment-scraper', {
            directUrls: [post_url],
            resultsLimit: 200
        }, webhookUrl);

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
            return res.json({ status: 'failed', request_id: requestId, error: trackRequest.error });
        }

        // If ready, return the results
        res.json({
            status: 'done',
            request_id: requestId,
            post_url: trackRequest.postUrl,
            likes: trackRequest.results.likes,
            comments: trackRequest.results.comments,
            reposts: trackRequest.results.reposts || []
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
            const foundUsers = items.map(i => {
                const username = extractUsername(i);
                const mention = i.text?.match(/@(\w+)/)?.[1] || '';
                return mention ? [norm(username), norm(mention)] : [norm(username)];
            }).flat().filter(n => n.length > 0);

            console.log(`[Webhook] Extracted ${foundUsers.length} potential usernames from items.`);

            const filteredResults = trackRequest.targetGroup.filter((u, i) => foundUsers.includes(targetNorm[i]));
            console.log(`[Webhook] Filtered matches for targetGroup: ${filteredResults.length}`);

            // In default payload, actId and id are in data (resource)
            const actId = data.actId || data.actorId;
            const runId = data.id || data.actorRunId || resource?.id;

            const isLikes = (actId?.includes('likes-scraper') || trackRequest.likesRunId === runId);
            
            if (isLikes) {
                trackRequest.results.likes = filteredResults;
            } else {
                trackRequest.results.comments = filteredResults;
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
                     trackRequest.status = 'ready';
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
