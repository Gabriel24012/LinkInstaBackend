const { ApifyClient } = require('apify-client');
const axios = require('axios');

const client = new ApifyClient({
    token: process.env.APIFY_API_TOKEN,
});

const triggerActor = async (actorId, input, webhookUrl) => {
    try {
        const run = await client.actor(actorId).start(input, {
             webhooks: [
                {
                    eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED', 'ACTOR.RUN.ABORTED'],
                    requestUrl: webhookUrl,
                    payloadTemplate: `{
                        "event": {{eventType}},
                        "resource": {{resource}},
                        "data": {{data}}
                    }`
                }
            ]
        });
        return run;
    } catch (error) {
        console.error(`Error triggering actor ${actorId}:`, error);
        throw error;
    }
};

const getDatasetItems = async (datasetId) => {
    try {
        const { items } = await client.dataset(datasetId).listItems();
        return items;
    } catch (error) {
        console.error(`Error fetching dataset ${datasetId}:`, error);
        throw error;
    }
};

module.exports = {
    triggerActor,
    getDatasetItems
};
