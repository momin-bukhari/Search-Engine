const fs = require('fs');
const path = require('path');
const { Trie } = require('./trie');

// --- Configuration ---
const VOCABULARY_INPUT_FILE = '../data/lexicon.json';
const DOCSTORE_INPUT_FILE = '../data/docStore.json'; 
const BARRELS_DIR = '../data/barrels';
const NUM_BARRELS = 64;
const MAX_AUTOCOMPLETE_SUGGESTIONS = 10;
const MIN_TOKEN_LENGTH = 3; 

// Field weights for scoring
const FIELD_WEIGHTS = {
    1: 5, // TITLE
    2: 1, // ABSTRACT
    3: 3, // CATEGORIES
    4: 1, // AUTHORS
    5: 1, // SUBMITTER
};

// Stop words
const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "if", "in", "is", "it",
    "no", "not", "of", "on", "or", "such", "that", "the", "their", "then", "there",
    "these", "they", "this", "to", "was", "will", "with", "from", "which", "can", "we",
    "i", "my", "your", "its", "all", "our"
]);

const TOKEN_REGEX = /[a-z]+/g;

// --- State ---
let trie = null;
let vocabulary = null;
let invertedIndexCache = new Map();
let docStore = null; 
// ADDED: State variable for tracking last successful initialization time
let lastInitialized = Date.now(); 

/**
 * Tokenize and filter query
 */
function tokenizeQuery(query) {
    if (!query) return [];
    return (query.toLowerCase().match(TOKEN_REGEX) || [])
        .filter(t => t.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(t));
}

// ... (loadLexicon, loadDocStore, initializeTrie, getBarrelIndex, loadBarrel, calculateSingleWordScore, calculateProximityBonus, executeSearch functions remain the same) ...

function loadLexicon() {
    try {
        const raw = fs.readFileSync(path.join(__dirname, VOCABULARY_INPUT_FILE), 'utf8');
        vocabulary = JSON.parse(raw);
        console.log(`[SearchEngine] Loaded ${Object.keys(vocabulary).length} words into lexicon.`);
        return Object.keys(vocabulary);
    } catch (err) {
        console.error("[SearchEngine] Failed to load lexicon:", err.message);
        throw err;
    }
}

function loadDocStore() {
    try {
        const raw = fs.readFileSync(path.join(__dirname, DOCSTORE_INPUT_FILE), 'utf8');
        docStore = JSON.parse(raw);
        console.log(`[SearchEngine] Loaded ${Object.keys(docStore).length} documents into Doc Store.`);
    } catch (err) {
        console.error("[SearchEngine] Failed to load Document Store:", err.message);
        throw err;
    }
}

function initializeTrie(words) {
    console.log('[SearchEngine] Building Trie for autocomplete...');
    const startTime = Date.now();
    
    trie = new Trie();
    for (const word of words) {
        trie.insert(word);
    }
    
    const buildTime = Date.now() - startTime;
    console.log(`[SearchEngine] Trie built successfully in ${buildTime}ms.`);
}

function getBarrelIndex(wordId) {
    return wordId % NUM_BARRELS;
}

function loadBarrel(barrelIndex) {
    if (invertedIndexCache.has(barrelIndex)) {
        return invertedIndexCache.get(barrelIndex);
    }

    try {
        const file = path.join(__dirname, BARRELS_DIR, `barrel_${barrelIndex}.json`);
        const raw = fs.readFileSync(file, 'utf8');
        const barrelData = JSON.parse(raw);
        const map = new Map(Object.entries(barrelData));
        invertedIndexCache.set(barrelIndex, map);
        return map;
    } catch (err) {
        return new Map();
    }
}

function calculateSingleWordScore(posting) {
    let score = 0;
    for (const hit of posting.hits) {
        score += FIELD_WEIGHTS[hit.type] || 0;
    }
    return score;
}

function calculateProximityBonus(docPostings) {
    const allPositions = [];
    for (const posting of docPostings) {
        for (const hit of posting.hits) {
            allPositions.push(hit.pos);
        }
    }

    if (!allPositions.length) return 0;

    allPositions.sort((a, b) => a - b);
    const span = allPositions[allPositions.length - 1] - allPositions[0];
    const maxSpan = 500;
    return Math.max(0, maxSpan - Math.min(span, maxSpan)) / 100;
}

function executeSearch(query) {
    const startTime = Date.now();

    const queryTokens = tokenizeQuery(query);
    if (!queryTokens.length) {
        return { results: [], time: 0, tokens: [] };
    }

    const wordIds = [];
    const barrelsToLoad = new Set();

    for (const token of queryTokens) {
        const id = vocabulary[token];
        if (id) {
            wordIds.push(id);
            barrelsToLoad.add(getBarrelIndex(id));
        }
    }

    if (!wordIds.length) {
        return { results: [], time: 0, tokens: queryTokens };
    }

    // Load required barrels
    const loaded = {};
    for (const idx of barrelsToLoad) {
        const barrel = loadBarrel(idx);
        for (const [id, postings] of barrel.entries()) {
            loaded[id] = postings;
        }
    }

    // Intersect posting lists
    const candidateDocs = {};
    const firstWord = wordIds[0];
    const firstPostings = loaded[firstWord] || [];

    for (const p of firstPostings) {
        candidateDocs[p.docId] = [p];
    }

    for (let i = 1; i < wordIds.length; i++) {
        const id = wordIds[i];
        const postings = loaded[id] || [];
        const map = new Map(postings.map(p => [p.docId, p]));

        for (const docId in candidateDocs) {
            if (map.has(docId)) {
                candidateDocs[docId].push(map.get(docId));
            } else {
                delete candidateDocs[docId];
            }
        }
    }

    // Score and sort results
    const results = [];
    for (const docId in candidateDocs) {
        const postings = candidateDocs[docId];

        let score = 0;
        for (const p of postings) {
            score += calculateSingleWordScore(p);
        }

        if (wordIds.length > 1) {
            score += calculateProximityBonus(postings);
        }

        results.push({
            docId,
            score,
            wordCount: postings.length,
            proximityBonus: wordIds.length > 1 ? calculateProximityBonus(postings) : 0,
        });
    }

    results.sort((a, b) => b.score - a.score);

    return {
        results,
        time: Date.now() - startTime,
        tokens: queryTokens,
        totalResults: results.length
    };
}


/**
 * Public API
 */
module.exports = {
    /**
     * Initialize the search engine
     */
    initialize: function () {
        // If vocabulary is null, it means the main thread cache is stale or uninitialized
        if (!vocabulary) {
            const words = loadLexicon();
            loadDocStore(); 
            initializeTrie(words);
            
            // ⬅️ CRITICAL: Update the timestamp after all caches are loaded
            lastInitialized = Date.now();
            console.log('[SearchEngine] Initialization complete.');
        } else {
            // This case handles cache reloads after indexing completes
            const words = loadLexicon(); // Re-load Lexicon to get new words
            loadDocStore();             // Re-load Doc Store to get new metadata
            initializeTrie(words);      // Re-build Trie with new words
            lastInitialized = Date.now(); // Update the timestamp
            console.log('[SearchEngine] Cache reload complete.');
        }
    },

    /**
     * Get autocomplete suggestions
     */
    autocomplete: function (query) {
        if (!trie) {
            throw new Error('Search engine not initialized');
        }
        
        const normalizedQuery = query.toLowerCase();
        
        const lastSpaceIndex = normalizedQuery.lastIndexOf(' ');
        
        let prefix = normalizedQuery;
        let baseQuery = '';

        if (lastSpaceIndex !== -1) {
            // Extract the prefix (the word being typed)
            prefix = normalizedQuery.substring(lastSpaceIndex + 1);
            // Extract the base query (the words already completed, including the space)
            baseQuery = normalizedQuery.substring(0, lastSpaceIndex + 1);
        }
        
        // FIX: If the prefix is an empty string (user typed only spaces), return no suggestions.
        if (prefix.length === 0) {
            return [];
        }

        // 1. Only autocomplete the current prefix
        let suggestionsForPrefix = trie.autocomplete(prefix, MAX_AUTOCOMPLETE_SUGGESTIONS);

        // 2. Filter out suggestions that are too short (like 'a', 'aa', 'aaa')
        suggestionsForPrefix = suggestionsForPrefix.filter(word => word.length >= MIN_TOKEN_LENGTH);

        // 3. Recombine the suggestions with the base query
        return suggestionsForPrefix.map(suggestion => baseQuery + suggestion);
    },

    /**
     * Search with pagination
     */
    search: function (query, page = 1, limit = 10) {
        // CHECK: Ensure the Doc Store is loaded before proceeding
        if (!vocabulary || !docStore) {
            throw new Error('Search engine not initialized or Doc Store failed to load.');
        }

        const searchResult = executeSearch(query);

        const startIdx = (page - 1) * limit;
        const endIdx = startIdx + limit;
        
        // Paginate the raw results (DocID, score)
        const paginatedResultsRaw = searchResult.results.slice(startIdx, endIdx);

        //Enrich results with metadata using O(1) Doc Store lookup
        const enrichedResults = paginatedResultsRaw.map(rawResult => {
            const metadata = docStore[rawResult.docId];
            
            // If metadata is found, merge it with the ranking data
            if (metadata) {
                return {
                    ...rawResult, // docId, score, wordCount, proximityBonus
                    title: metadata.title,
                    authors: metadata.authors,
                    categories: metadata.categories
                };
            }
            // If the document somehow is not in the Doc Store, return the raw data
            return rawResult;
        });

        return {
            results: enrichedResults, // Send the enriched results
            time: searchResult.time,
            tokens: searchResult.tokens,
            page: page,
            limit: limit,
            totalResults: searchResult.totalResults,
            hasMore: endIdx < searchResult.results.length
        };
    },

    /**
     * Get engine status
     */
    getStatus: function () {
        return {
            status: 'ok',
            trie: trie !== null,
            vocabulary: vocabulary !== null,
            cachedBarrels: invertedIndexCache.size,
            vocabularySize: vocabulary ? Object.keys(vocabulary).length : 0,
            // ADDED: Report status of Doc Store
            docStoreLoaded: docStore !== null,
            // ⬅️ ADDED: Report the last initialization time
            lastInitialized: lastInitialized
        };
    }
};