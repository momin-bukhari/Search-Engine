const express = require('express');
const router = express.Router();
const searchEngine = require('../utils/searchEngine');
const { runIncrementalIndex } = require('../utils/indexerManager'); // Handles async indexing in Worker Threads

// --- GET /api/search ---
// Handles search queries with pagination
router.get('/search', (req, res) => {
    const { q, page, limit } = req.query; 
    const query = q ? String(q) : '';
    const searchPage = parseInt(page) || 1;
    const searchLimit = parseInt(limit) || 10;
    
    if (!query) {
        return res.json({ results: [], time: 0, tokens: [], totalResults: 0, hasMore: false });
    }

    try {
        const searchResult = searchEngine.search(query, searchPage, searchLimit);
        res.json(searchResult);
    } catch (error) {
        console.error("[API Error] /api/search failed:", error.message);
        res.status(500).json({ error: "Failed to execute search query.", message: error.message });
    }
});

// --- GET /api/autocomplete ---
// Returns real-time suggestions for the current query prefix
router.get('/autocomplete', (req, res) => {
    const { q } = req.query;
    const query = q ? String(q) : '';

    if (!query) return res.json({ suggestions: [] });

    try {
        const suggestions = searchEngine.autocomplete(query);
        res.json({ suggestions });
    } catch (error) {
        console.error("[API Error] /api/autocomplete failed:", error.message);
        res.status(500).json({ error: "Failed to fetch autocomplete suggestions.", message: error.message });
    }
});

// --- GET /api/health ---
// Returns engine status for monitoring
router.get('/health', (req, res) => {
    try {
        const status = searchEngine.getStatus();
        res.json(status);
    } catch (error) {
        res.status(503).json({ status: 'error', message: 'Search engine uninitialized or failed to report status.' });
    }
});

// --- POST /api/admin/index ---
// Trigger incremental indexing for new articles (non-blocking)
router.post('/admin/index', async (req, res) => {
    const newArticles = req.body.articles; 
    
    if (!Array.isArray(newArticles) || newArticles.length === 0) {
         return res.status(400).json({ 
            error: "Invalid request body.",
            message: "Request body must contain an array of articles under the 'articles' key."
        });
    }

    try {
        // Run indexing asynchronously on a Worker Thread
        runIncrementalIndex(newArticles)
            .then(result => {
                // Refresh main thread caches after indexing
                searchEngine.initialize(); 
                console.log("[API] Asynchronous indexing complete and caches reloaded:", result.message);
            })
            .catch(error => {
                console.error("[API] Asynchronous indexing failed:", error.message);
            });

        // Immediate response: 202 Accepted
        res.status(202).json({ 
            message: `Indexing started for ${newArticles.length} articles on a background worker thread.`,
            status: "indexing_started"
        });

    } catch (error) {
        res.status(500).json({ error: "Failed to start indexing process.", message: error.message });
    }
});

module.exports = router;
