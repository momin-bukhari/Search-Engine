const fs = require('fs');
const path = require('path');

// --- Configuration ---
const VOCABULARY_INPUT_FILE = '../data/lexicon.json';
const BARRELS_DIR = '../data/barrels';
const NUM_BARRELS = 64; // Must match buildBarrels.js

// Field weights used when scoring postings. Higher = more influence.
const FIELD_WEIGHTS = {
    1: 5, // TITLE
    2: 1, // ABSTRACT
    3: 3, // CATEGORIES
    4: 1, // AUTHORS
    5: 1, // SUBMITTER
};

// Stop-words filtered out at query time (must align with buildLexicon.js)
const STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","but","by","for","if","in","is","it",
  "no","not","of","on","or","such","that","the","their","then","there",
  "these","they","this","to","was","will","with","from","which","can","we",
  "i","my","your","its","all","our"
]);

// Basic tokenizer used to normalize queries
const TOKEN_REGEX = /[a-z]+/g;
function tokenizeQuery(query) {
    if (!query) return [];
    return (query.toLowerCase().match(TOKEN_REGEX) || [])
        .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

/**
 * Searcher:
 * Loads lexicon, lazily loads barrels, and executes ranked queries.
 */
class Searcher {
    constructor() {
        this.vocabulary = null;                 // token -> wordID
        this.invertedIndexCache = new Map();    // barrelIndex -> Map(wordID -> postings[])
    }

    /**
     * Loads the in-memory lexicon. Small enough to fit entirely in RAM.
     */
    loadLexicon() {
        try {
            const raw = fs.readFileSync(path.join(__dirname, VOCABULARY_INPUT_FILE), 'utf8');
            this.vocabulary = JSON.parse(raw);
            console.log(`[Searcher] Loaded ${Object.keys(this.vocabulary).length} words.`);
        } catch (err) {
            console.error("[Searcher] Failed to load lexicon.");
            throw err;
        }
    }

    /**
     * WordID → barrel index (consistent with buildBarrels.js hashing).
     */
    getBarrelIndex(wordId) {
        return wordId % NUM_BARRELS;
    }

    /**
     * Loads a single barrel from disk on-demand and caches it.
     * Only barrels required for a given query are loaded.
     */
    loadBarrel(barrelIndex) {
        if (this.invertedIndexCache.has(barrelIndex)) {
            return this.invertedIndexCache.get(barrelIndex);
        }

        try {
            const file = path.join(__dirname, BARRELS_DIR, `barrel_${barrelIndex}.json`);
            const raw = fs.readFileSync(file, 'utf8');
            const barrelData = JSON.parse(raw);

            const map = new Map(Object.entries(barrelData));
            this.invertedIndexCache.set(barrelIndex, map);

            console.log(`[Searcher] Loaded barrel ${barrelIndex}.`);
            return map;
        } catch (err) {
            // Barrel may legitimately not exist (sparse hashing)
            console.warn(`[Searcher] Barrel ${barrelIndex} missing; using empty.`);
            return new Map();
        }
    }

    /**
     * Computes the score contribution of a single word’s posting list for a doc.
     */
    calculateSingleWordScore(posting) {
        let score = 0;

        for (const hit of posting.hits) {
            score += FIELD_WEIGHTS[hit.type] || 0;
        }
        return score;
    }

    /**
     * Adds a small bonus when all query terms appear close together.
     * Very lightweight proxy for proximity scoring.
     */
    calculateProximityBonus(docPostings) {
        const allPositions = [];
        for (const posting of docPostings) {
            for (const hit of posting.hits) {
                allPositions.push(hit.pos);
            }
        }

        if (!allPositions.length) return 0;

        allPositions.sort((a, b) => a - b);
        const span = allPositions[allPositions.length - 1] - allPositions[0];

        // Reward tighter spans, lightly normalized.
        const maxSpan = 500;
        return Math.max(0, maxSpan - Math.min(span, maxSpan)) / 100;
    }

    /**
     * Executes a ranked search:
     * 1. Tokenize → wordIDs
     * 2. Load required barrels
     * 3. Intersect posting lists
     * 4. Score + proximity
     */
    search(query) {
        const startTime = Date.now();
        if (!this.vocabulary) throw new Error("Lexicon not loaded.");

        const queryTokens = tokenizeQuery(query);
        if (!queryTokens.length) {
            return { results: [], time: 0, tokens: [] };
        }

        // Map query tokens → WordIDs and identify which barrels to load
        const wordIds = [];
        const barrelsToLoad = new Set();

        for (const token of queryTokens) {
            const id = this.vocabulary[token];
            if (id) {
                wordIds.push(id);
                barrelsToLoad.add(this.getBarrelIndex(id));
            }
        }

        if (!wordIds.length) {
            return { results: [], time: 0, tokens: queryTokens };
        }

        // Load barrels required for these wordIDs
        const loaded = {};
        for (const idx of barrelsToLoad) {
            const barrel = this.loadBarrel(idx);
            for (const [id, postings] of barrel.entries()) {
                loaded[id] = postings;
            }
        }

        // Build initial candidate set from the first word
        const candidateDocs = {};
        const firstWord = wordIds[0];
        const firstPostings = loaded[firstWord] || [];

        for (const p of firstPostings) {
            candidateDocs[p.docId] = [p];
        }

        // Intersect with remaining words
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

        // Score candidates
        const results = [];
        for (const docId in candidateDocs) {
            const postings = candidateDocs[docId];

            let score = 0;
            for (const p of postings) {
                score += this.calculateSingleWordScore(p);
            }

            if (wordIds.length > 1) {
                score += this.calculateProximityBonus(postings);
            }

            results.push({
                docId,
                score,
                detail: {
                    wordCount: postings.length,
                    proximityBonus: wordIds.length > 1 ? this.calculateProximityBonus(postings) : 0,
                }
            });
        }

        results.sort((a, b) => b.score - a.score);

        return {
            results,
            time: Date.now() - startTime,
            tokens: queryTokens
        };
    }
}

// Simple test harness
function main() {
    const engine = new Searcher();

    try {
        engine.loadLexicon();

        console.log(`\n--- Query: "machine" ---`);
        let r = engine.search("machine");
        console.log(`Time: ${r.time}ms`);
        console.log(r.results.slice(0, 5));

        console.log(`\n--- Query: "deep learning" ---`);
        r = engine.search("deep learning");
        console.log(`Time: ${r.time}ms`);
        console.log(r.results.slice(0, 5));

    } catch (err) {
        console.error("SEARCHER ERROR:", err.message);
    }
}

main();