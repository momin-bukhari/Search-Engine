const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const searchEngine = require('./utils/searchEngine'); // ⬅️ ADDED

const app = express();
const PORT = process.env.PORT || 3001;

// --- CRITICAL FIX: INITIALIZE SEARCH ENGINE ---
try {
    searchEngine.initialize(); // ⬅️ ADDED
    console.log('[Server] Search engine initialization successful.');
} catch (error) {
    console.error("FATAL ERROR: Failed to initialize search engine. Shutting down.", error.message);
    process.exit(1); // Exit if essential data fails to load
}
// ----------------------------------------------

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', apiRoutes);

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Search Engine API Server',
        version: '1.0.0'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[Server Error]:', err.message);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
    console.log(`[Server] API endpoints:`);
    console.log(`  - GET  /api/autocomplete?q=<query>`);
    console.log(`  - GET  /api/search?q=<query>&page=<page>&limit=<limit>`);
    console.log(`  - GET  /api/health`);
});