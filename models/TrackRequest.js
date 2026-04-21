const mongoose = require('mongoose');

const UserInteractionSchema = new mongoose.Schema({
    username: { type: String, required: true },
    displayName: { type: String, default: '' },
    profilePicUrl: { type: String, default: '' },
    isPrivate: { type: Boolean, default: false },
    isVerified: { type: Boolean, default: false },
    gaveLike: { type: Boolean, default: false },
    commented: { type: Boolean, default: false },
    commentText: { type: String, default: '' },
    commentDate: { type: Date, default: null },
    likeDate: { type: Date, default: null },
    interactionCount: { type: Number, default: 0 }
}, { _id: false });

const TrackRequestSchema = new mongoose.Schema({
    requestId: { type: String, required: true, unique: true },
    postUrl: { type: String, required: true },
    targetGroup: [{ type: String }],
    likesRunId: { type: String },
    commentsRunId: { type: String },
    finishedRuns: [{ type: String }],
    status: { type: String, enum: ['processing', 'ready', 'failed'], default: 'processing' },
    results: {
        likes: [{ type: String }],
        comments: [{ type: String }],
        reposts: [{ type: String }]
    },
    detailedResults: {
        interactions: [UserInteractionSchema],
        summary: {
            totalLikes: { type: Number, default: 0 },
            totalComments: { type: Number, default: 0 },
            uniqueUsers: { type: Number, default: 0 },
            privateAccounts: { type: Number, default: 0 },
            verifiedAccounts: { type: Number, default: 0 }
        },
        chartData: {
            labels: [{ type: String }],
            likes: [{ type: Number }],
            comments: [{ type: Number }],
            total: [{ type: Number }]
        }
    },
    diagnostics: {
        likes: { type: String, default: '' },
        comments: { type: String, default: '' }
    },
    tempLikesInteractions: [UserInteractionSchema],
    tempCommentsInteractions: [UserInteractionSchema],
    error: { type: String },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('TrackRequest', TrackRequestSchema);
