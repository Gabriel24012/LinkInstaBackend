require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const trackRoutes = require('./routes/trackRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Normalize PUBLIC_URL (remove trailing slash)
if (process.env.PUBLIC_URL && process.env.PUBLIC_URL.endsWith('/')) {
    process.env.PUBLIC_URL = process.env.PUBLIC_URL.slice(0, -1);
}

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/track', trackRoutes);

// For compatibility with the Android app's current paths
app.use('/ig-track', trackRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({ message: 'LinkInsta Backend is running', version: '1.0.0' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Public URL: ${process.env.PUBLIC_URL || 'Not set'}`);
});
