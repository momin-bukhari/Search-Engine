const fs = require('fs');
const path = require('path');
const { Trie } = require('./trie');
const semanticModel = require('./semanticModel'); // Semantic vector-based synonym model

// --- Configuration ---
const VOCABULARY_INPUT_FILE = '../data/lexicon.json';
const DOCSTORE_INPUT_FILE = '../data/docStore.json';
const BARRELS_DIR = '../data/barrels';
const NUM_BARRELS = 64;
const MAX_AUTOCOMPLETE_SUGGESTIONS = 10;
const MIN_TOKEN_LENGTH = 3;

// Field weights for scoring
const FIELD_WEIGHTS = { 1: 5, 2: 1, 3: 3, 4: 1, 5: 1 };

// Stop words
const STOP_WORDS = new Set([
    "a","an","and","are","as","at","be","but","by","for","if","in","is","it",
    "no","not","of","on","or","such","that","the","their","then","there",
    "these","they","this","to","was","will","with","from","which","can","we",
    "i","my","your","its","all","our"
]);

const TOKEN_REGEX = /[a-z]+/g;

// --- State ---
let trie = null;
let vocabulary = null;
let invertedIndexCache = new Map();
let docStore = null;
let lastInitialized = Date.now(); // Timestamp of last init

/**
 * Tokenize query: lowercase, remove stopwords, min length
 */
function tokenizeQuery(query) {
    if (!query) return [];
    return (query.toLowerCase().match(TOKEN_REGEX) || [])
        .filter(t => t.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(t));
}

/**
 * Load lexicon from disk
 */
function loadLexicon() {
    try {
        const raw = fs.readFileSync(path.join(__dirname, VOCABULARY_INPUT_FILE), 'utf8');
        vocabulary = JSON.parse(raw);
        console.log(`[SearchEngine] Loaded ${Object.keys(vocabulary).length} words.`);
        return Object.keys(vocabulary);
    } catch (err) {
        console.error("[SearchEngine] Failed to load lexicon:", err.message);
        throw err;
    }
}

/**
 * Load document metadata store
 */
function loadDocStore() {
    try {
        const raw = fs.readFileSync(path.join(__dirname, DOCSTORE_INPUT_FILE), 'utf8');
        docStore = JSON.parse(raw);
        console.log(`[SearchEngine] Loaded ${Object.keys(docStore).length} documents.`);
    } catch (err) {
        console.error("[SearchEngine] Failed to load Doc Store:", err.message);
        throw err;
    }
}

/**
 * Build Trie for autocomplete
 */
function initializeTrie(words) {
    console.log('[SearchEngine] Building Trie...');
    const startTime = Date.now();
    trie = new Trie();
    for (const word of words) trie.insert(word);
    console.log(`[SearchEngine] Trie built in ${Date.now() - startTime}ms.`);
}

/**
 * Determine barrel index for a wordId
 */
function getBarrelIndex(wordId) {
    return wordId % NUM_BARRELS;
}

/**
 * Load a barrel (caching for efficiency)
 */
function loadBarrel(barrelIndex) {
    if (invertedIndexCache.has(barrelIndex)) return invertedIndexCache.get(barrelIndex);
    try {
        const raw = fs.readFileSync(path.join(__dirname, BARRELS_DIR, `barrel_${barrelIndex}.json`), 'utf8');
        const map = new Map(Object.entries(JSON.parse(raw)));
        invertedIndexCache.set(barrelIndex, map);
        return map;
    } catch (err) {
        return new Map();
    }
}

/**
 * Score a single word occurrence
 */
function calculateSingleWordScore(posting) {
    return posting.hits.reduce((sum, h) => sum + (FIELD_WEIGHTS[h.type] || 0), 0);
}

/**
 * Bonus for words appearing close together
 */
function calculateProximityBonus(docPostings) {
    const positions = docPostings.flatMap(p => p.hits.map(h => h.pos));
    if (!positions.length) return 0;
    positions.sort((a, b) => a - b);
    const span = positions[positions.length - 1] - positions[0];
    const maxSpan = 500;
    return Math.max(0, maxSpan - Math.min(span, maxSpan)) / 100;
}

/**
 * Expand query terms with synonyms
 */
function getQueryGroups(tokens) {
    return tokens.map(token => {
        const group = new Set([token]);
        const synonyms = semanticModel.findSynonyms(token);
        synonyms.forEach(s => group.add(s));
        if (synonyms.length) console.log(`[Semantic] "${token}" -> [${synonyms.join(", ")}]`);
        return group;
    });
}

/**
 * Execute search: tokenize, expand synonyms, retrieve postings, score, rank
 */
function executeSearch(query) {
    const startTime = Date.now();
    const queryTokens = tokenizeQuery(query);
    if (!queryTokens.length) return { results: [], time: 0, tokens: [] };

    const termGroups = getQueryGroups(queryTokens);

    const allWordIds = [];
    const barrelsToLoad = new Set();
    const wordIdToGroupIdx = {};

    termGroups.forEach((group, idx) => {
        for (const word of group) {
            const id = vocabulary[word];
            if (id) {
                allWordIds.push(id);
                barrelsToLoad.add(getBarrelIndex(id));
                if (!wordIdToGroupIdx[id]) wordIdToGroupIdx[id] = [];
                wordIdToGroupIdx[id].push(idx);
            }
        }
    });

    if (!allWordIds.length) return { results: [], time: Date.now() - startTime, tokens: queryTokens };

    const loadedPostings = {};
    for (const idx of barrelsToLoad) {
        const barrel = loadBarrel(idx);
        for (const id of allWordIds) if (barrel.has(String(id))) loadedPostings[id] = barrel.get(String(id));
    }

    // OR logic within each group
    const groupDocs = termGroups.map((group, i) => {
        const docs = new Map();
        for (const word of group) {
            const id = vocabulary[word];
            if (loadedPostings[id]) {
                for (const posting of loadedPostings[id]) {
                    const isExact = (word === queryTokens[i]);
                    const scoredPosting = { ...posting, isExact };
                    const existing = docs.get(posting.docId);
                    if (!existing || (isExact && !existing.isExact)) docs.set(posting.docId, scoredPosting);
                }
            }
        }
        return docs;
    });

    // AND logic across groups
    if (!groupDocs.length) return { results: [], time: Date.now() - startTime, tokens: queryTokens };
    groupDocs.sort((a, b) => a.size - b.size);
    let candidateDocs = groupDocs[0];

    for (let i = 1; i < groupDocs.length; i++) {
        const nextGroup = groupDocs[i];
        const intersection = new Map();
        for (const [docId, posting] of candidateDocs) {
            if (nextGroup.has(docId)) {
                const prevPostings = Array.isArray(posting) ? posting : [posting];
                const nextPostings = Array.isArray(nextGroup.get(docId)) ? nextGroup.get(docId) : [nextGroup.get(docId)];
                intersection.set(docId, [...prevPostings, ...nextPostings]);
            }
        }
        candidateDocs = intersection;
        if (!candidateDocs.size) break;
    }

    const results = [];
    for (const [docId, postingData] of candidateDocs) {
        const postingsArr = Array.isArray(postingData) ? postingData : [postingData];
        let totalScore = 0, exactMatches = 0;

        for (const p of postingsArr) {
            let score = calculateSingleWordScore(p);
            if (!p.isExact) score *= 0.5;
            else exactMatches++;
            totalScore += score;
        }

        if (postingsArr.length > 1) totalScore += calculateProximityBonus(postingsArr);

        results.push({
            docId,
            score: totalScore,
            wordCount: postingsArr.length,
            matchType: exactMatches === queryTokens.length ? "Exact" : "Semantic"
        });
    }

    results.sort((a, b) => b.score - a.score);

    return { results, time: Date.now() - startTime, tokens: queryTokens, expandedTokens: termGroups, totalResults: results.length };
}

/**
 * Public API
 */
module.exports = {
    initialize: async function () {
        if (!vocabulary) {
            const words = loadLexicon();
            loadDocStore();
            initializeTrie(words);
            console.log("[SearchEngine] Initializing Semantic Model...");
            await semanticModel.load(new Set(Object.keys(vocabulary)));
            lastInitialized = Date.now();
            console.log('[SearchEngine] Initialization complete.');
        } else {
            // Reload cache
            const words = loadLexicon();
            loadDocStore();
            initializeTrie(words);
            lastInitialized = Date.now();
            console.log('[SearchEngine] Cache reload complete.');
        }
    },

    autocomplete: function (query) {
        if (!trie) throw new Error('Search engine not initialized');
        const normalizedQuery = query.toLowerCase();
        const lastSpace = normalizedQuery.lastIndexOf(' ');
        let prefix = normalizedQuery, baseQuery = '';

        if (lastSpace !== -1) {
            prefix = normalizedQuery.substring(lastSpace + 1);
            baseQuery = normalizedQuery.substring(0, lastSpace + 1);
        }
        if (!prefix) return [];

        let suggestions = trie.autocomplete(prefix, MAX_AUTOCOMPLETE_SUGGESTIONS);
        suggestions = suggestions.filter(w => w.length >= MIN_TOKEN_LENGTH);
        return suggestions.map(s => baseQuery + s);
    },

    search: function (query, page = 1, limit = 10) {
        if (!vocabulary || !docStore) throw new Error('Search engine not initialized');

        const searchResult = executeSearch(query);
        const startIdx = (page - 1) * limit;
        const endIdx = startIdx + limit;
        const paginated = searchResult.results.slice(startIdx, endIdx);

        const enriched = paginated.map(r => {
            const meta = docStore[r.docId];
            return meta ? { ...r, title: meta.title, authors: meta.authors, categories: meta.categories } : r;
        });

        return {
            results: enriched,
            time: searchResult.time,
            tokens: searchResult.tokens,
            page, limit,
            totalResults: searchResult.totalResults,
            hasMore: endIdx < searchResult.results.length
        };
    },

    getStatus: function () {
        return {
            status: 'ok',
            trie: !!trie,
            vocabulary: !!vocabulary,
            cachedBarrels: invertedIndexCache.size,
            vocabularySize: vocabulary ? Object.keys(vocabulary).length : 0,
            docStoreLoaded: !!docStore,
            lastInitialized
        };
    }
};
