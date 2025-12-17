const fs = require('fs');
const path = require('path');
const { Trie } = require('./trie');
const semanticModel = require('./semanticModel'); // Import the new file

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

/**
 * Turns ["mobile", "data"] into:
 * [ Set("mobile", "phone"), Set("data", "info") ]
 */
function getQueryGroups(tokens) {
    const groups = [];
    
    for (const token of tokens) {
        const group = new Set();
        group.add(token); // Always keep the original word
        
        // Ask GloVe for synonyms
        const synonyms = semanticModel.findSynonyms(token);
        
        // Add synonyms to the group
        synonyms.forEach(syn => group.add(syn));
        
        if (synonyms.length > 0) {
            console.log(`[Semantic] Expanded "${token}" -> [${synonyms.join(", ")}]`);
        }
        
        groups.push(group);
    }
    return groups;
}

function executeSearch(query) {
    const startTime = Date.now();
    const queryTokens = tokenizeQuery(query);
    
    if (!queryTokens.length) return { results: [], time: 0, tokens: [] };

    // 1. Expand Query: Get groups of synonyms
    // e.g. [ Set("mobile", "phone"), Set("data", "info") ]
    const termGroups = getQueryGroups(queryTokens);
    
    // 2. Identify ALL WordIDs needed (Originals + Synonyms)
    const allWordIds = [];
    const barrelsToLoad = new Set();
    
    // We need to know which group a word belongs to.
    // Map: wordId -> [groupIndex1, groupIndex2...]
    // (A word could theoretically belong to multiple groups)
    const wordIdToGroupIdx = {}; 

    termGroups.forEach((group, groupIdx) => {
        for (const word of group) {
            const id = vocabulary[word];
            if (id) {
                allWordIds.push(id);
                barrelsToLoad.add(getBarrelIndex(id));
                
                if (!wordIdToGroupIdx[id]) wordIdToGroupIdx[id] = [];
                wordIdToGroupIdx[id].push(groupIdx);
            }
        }
    });

    if (!allWordIds.length) {
        return { results: [], time: Date.now() - startTime, tokens: queryTokens };
    }

    // 3. Load Barrels into Memory
    const loadedPostings = {}; // wordId -> [postings]
    for (const idx of barrelsToLoad) {
        const barrel = loadBarrel(idx);
        for (const id of allWordIds) {
            if (barrel.has(String(id))) {
                loadedPostings[id] = barrel.get(String(id));
            }
        }
    }

    // 4. Build Document Sets for each Group (OR Logic)
    // We want Docs containing ("mobile" OR "phone")
    const groupDocs = []; // Array of Maps: [ Map(DocID -> Posting), ... ]

    for (let i = 0; i < termGroups.length; i++) {
        const docsInThisGroup = new Map();
        const currentGroupSet = termGroups[i];

        for (const word of currentGroupSet) {
            const id = vocabulary[word];
            if (loadedPostings[id]) {
                for (const posting of loadedPostings[id]) {
                    
                    // SCORING: 
                    // If it's the exact word user typed, keep score 100%
                    // If it's a synonym (GloVe match), penalize it (50% score)
                    const isExactMatch = (word === queryTokens[i]);
                    
                    // Create a lightweight posting copy to attach the 'isExact' flag
                    const scoredPosting = { ...posting, isExact: isExactMatch };

                    // If this doc is already in the list for this group, 
                    // only overwrite it if the new match is "Better" (Exact vs Synonym)
                    const existing = docsInThisGroup.get(posting.docId);
                    if (!existing || (scoredPosting.isExact && !existing.isExact)) {
                        docsInThisGroup.set(posting.docId, scoredPosting);
                    }
                }
            }
        }
        groupDocs.push(docsInThisGroup);
    }

    // 5. Intersect the Groups (AND Logic)
    // We want: Group1 AND Group2 ...
    if (groupDocs.length === 0) return { results: [], time: 0, tokens: queryTokens };

    // Optimization: Start intersection with the smallest group
    groupDocs.sort((a, b) => a.size - b.size);
    
    let candidateDocs = groupDocs[0]; // Start with first group

    for (let i = 1; i < groupDocs.length; i++) {
        const nextGroup = groupDocs[i];
        const intersection = new Map();

        for (const [docId, posting] of candidateDocs) {
            if (nextGroup.has(docId)) {
                // Document exists in both groups!
                // We combine them into an array of postings for final scoring
                // Handle cases where 'posting' is already an array (from previous loop)
                const prevPostings = Array.isArray(posting) ? posting : [posting];
                const nextPostings = Array.isArray(nextGroup.get(docId)) ? nextGroup.get(docId) : [nextGroup.get(docId)];
                
                intersection.set(docId, [...prevPostings, ...nextPostings]);
            }
        }
        candidateDocs = intersection;
        if (candidateDocs.size === 0) break; // No documents match all terms
    }

    // 6. Calculate Final Scores
    const results = [];
    for (const [docId, postingData] of candidateDocs) {
        const postingsArr = Array.isArray(postingData) ? postingData : [postingData];
        
        let totalScore = 0;
        let exactMatchesCount = 0;

        for (const p of postingsArr) {
            let wordScore = calculateSingleWordScore(p);
            
            // RANKING PENALTY (Requirement #8)
            // Synonyms get 0.5x score, Exact matches get 1.0x
            if (!p.isExact) {
                wordScore *= 0.5; 
            } else {
                exactMatchesCount++;
            }
            totalScore += wordScore;
        }

        // Add Proximity Bonus if we have multiple words
        if (postingsArr.length > 1) {
            totalScore += calculateProximityBonus(postingsArr);
        }

        results.push({
            docId,
            score: totalScore,
            wordCount: postingsArr.length,
            // Tag result as "Semantic" if it relies on synonyms
            matchType: (exactMatchesCount === queryTokens.length) ? "Exact" : "Semantic"
        });
    }

    // Sort by Score
    results.sort((a, b) => b.score - a.score);

    return {
        results,
        time: Date.now() - startTime,
        tokens: queryTokens,
        expandedTokens: termGroups, // Optional: useful for debugging
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
    initialize: async function () { // <--- Make this ASYNC
        if (!vocabulary) {
            const words = loadLexicon();
            loadDocStore();
            initializeTrie(words);
            
            // --- NEW: Load Semantic Vectors ---
            console.log("[SearchEngine] Initializing Semantic Model...");
            const vocabSet = new Set(Object.keys(vocabulary));
            await semanticModel.load(vocabSet);
            // ----------------------------------

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