const mongoose = require('mongoose');

const TrackRequestSchema = new mongoose.Schema({
    requestId: { type: String, required: true, unique: true },
    postUrl: { type: String, required: true },
    targetGroup: [{ type: String }],
    likesRunId: { type: String },
    commentsRunId: { type: String },
    finishedRuns: [{ type: String }], // To track both runs
    status: { type: String, enum: ['processing', 'ready', 'failed'], default: 'processing' },
    results: {
        likes: [{ type: String }],
        comments: [{ type: String }],
        reposts: [{ type: String }]
    },
    error: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('TrackRequest', TrackRequestSchema);
