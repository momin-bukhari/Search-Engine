const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');

// --- Configuration ---
const APPEND_INPUT_FILE = '../data/appendArxiv.json';
const LEXICON_FILE = '../data/lexicon.json';
const BARRELS_DIR = '../data/barrels';

const NUM_BARRELS = 64;            // Must match barrel generation config
const MIN_WORD_LENGTH = 3;
const TOKEN_REGEX = /[a-z]+/g;

// Field types used during ranking and indexing
const FIELD_TYPES = {
    TITLE: 1,
    ABSTRACT: 2,
    CATEGORIES: 3,
    AUTHORS: 4,
    SUBMITTER: 5
};

// Stopwords to skip during tokenization
const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "but", "by",
    "for", "if", "in", "is", "it", "no", "not", "of", "on",
    "or", "such", "that", "the", "their", "then", "there",
    "these", "they", "this", "to", "was", "will", "with",
    "from", "which", "can", "we", "i", "my", "your", "its",
    "all", "our"
]);

// Load a JSON file; optionally convert to Map
function loadIndex(filePath, asMap = true) {
    try {
        const fullPath = path.resolve(__dirname, filePath);
        const raw = fs.readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(raw);
        return asMap ? new Map(Object.entries(parsed)) : parsed;
    } catch (err) {
        console.error(`ERROR: Failed to load ${filePath}`);
        throw err;
    }
}

// Save lexicon (small file → safe to write synchronously)
function saveLexicon(filePath, data) {
    const fullPath = path.resolve(__dirname, filePath);
    const obj = data instanceof Map ? Object.fromEntries(data) : data;
    fs.writeFileSync(fullPath, JSON.stringify(obj, null, 2));
}

// Get next available wordId
function findNextWordId(lexicon) {
    let maxId = 0;
    for (const id of lexicon.values()) {
        const n = parseInt(id);
        if (n > maxId) maxId = n;
    }
    return maxId + 1;
}

// Load a single barrel (or return empty map if not found)
function loadBarrel(barrelIndex) {
    const barrelPath = path.resolve(__dirname, BARRELS_DIR, `barrel_${barrelIndex}.json`);
    try {
        const raw = fs.readFileSync(barrelPath, 'utf8');
        return new Map(Object.entries(JSON.parse(raw)));
    } catch (err) {
        if (err.code === 'ENOENT') return new Map();
        throw err;
    }
}

// Save a single barrel back to disk
function saveBarrel(barrelIndex, dataMap) {
    const barrelPath = path.resolve(__dirname, BARRELS_DIR, `barrel_${barrelIndex}.json`);
    fs.writeFileSync(barrelPath, JSON.stringify(Object.fromEntries(dataMap), null, 2));
}

// Process new articles into postings and update lexicon
function processNewArticles(newArticles, lexicon, nextWordId) {
    const newPostingsByBarrel = new Map();
    let processed = 0;
    let totalHits = 0;

    for (const article of newArticles) {
        if (!article || !article.id) continue;

        const docId = article.id;
        const docEntry = {};
        let position = 0;

        try {
            const fields = [
                { text: article.title, type: FIELD_TYPES.TITLE },
                { text: article.abstract, type: FIELD_TYPES.ABSTRACT },
                { text: article.categories, type: FIELD_TYPES.CATEGORIES },
                { text: article.authors, type: FIELD_TYPES.AUTHORS },
                { text: article.submitter, type: FIELD_TYPES.SUBMITTER }
            ].filter(f => f.text);

            if (fields.length === 0) continue;

            for (const field of fields) {
                const tokens = field.text.toLowerCase().match(TOKEN_REGEX) || [];

                for (const token of tokens) {
                    if (token.length < MIN_WORD_LENGTH || STOP_WORDS.has(token)) {
                        position++;
                        continue;
                    }

                    let wordId = lexicon.get(token);
                    if (!wordId) {
                        wordId = String(nextWordId++);
                        lexicon.set(token, wordId);
                    }

                    const hit = { pos: position, type: field.type };

                    if (!docEntry[wordId]) docEntry[wordId] = [];
                    docEntry[wordId].push(hit);

                    totalHits++;
                    position++;
                }
            }

            if (Object.keys(docEntry).length === 0) continue;

            for (const wId in docEntry) {
                const hitList = docEntry[wId];
                const barrelIdx = parseInt(wId) % NUM_BARRELS;
                const posting = { docId, hits: hitList };

                let barrelMap = newPostingsByBarrel.get(barrelIdx);
                if (!barrelMap) {
                    barrelMap = new Map();
                    newPostingsByBarrel.set(barrelIdx, barrelMap);
                }

                const list = barrelMap.get(wId) || [];
                list.push(posting);
                barrelMap.set(wId, list);
            }

            processed++;

        } catch (err) {
            console.error(`Skipping article ${docId}: ${err.message}`);
        }
    }

    return {
        newPostingsByBarrel,
        updatedLexicon: lexicon,
        newNextWordId: nextWordId,
        processedCount: processed,
        totalNewHits: totalHits
    };
}

// Merge new postings into barrels on disk
function mergeNewPostings(newPostingsByBarrel) {
    let barrelsUpdated = 0;
    let totalMerged = 0;

    for (const [barrelIdx, newMap] of newPostingsByBarrel) {
        const existing = loadBarrel(barrelIdx);

        for (const [wordId, newPosts] of newMap) {
            const existingPosts = existing.get(wordId) || [];
            existingPosts.push(...newPosts);
            existing.set(wordId, existingPosts);
            totalMerged += newPosts.length;
        }

        saveBarrel(barrelIdx, existing);
        barrelsUpdated++;
    }

    return { barrelsUpdated, totalMerged };
}

// Main workflow
function main() {
    try {
        const lexicon = loadIndex(LEXICON_FILE);
        const newArticles = loadIndex(APPEND_INPUT_FILE, false);

        console.log(`Loaded lexicon with ${lexicon.size} words.`);
        console.log(`Articles to append: ${newArticles.length}`);

        let nextWordId = findNextWordId(lexicon);

        const {
            newPostingsByBarrel,
            updatedLexicon,
            processedCount,
            totalNewHits
        } = processNewArticles(newArticles, lexicon, nextWordId);

        const { barrelsUpdated, totalMerged } = mergeNewPostings(newPostingsByBarrel);

        saveLexicon(LEXICON_FILE, updatedLexicon);

        console.log("\n--- Incremental Indexing Complete ---");
        console.log(`New documents indexed: ${processedCount}`);
        console.log(`New hits collected: ${totalNewHits}`);
        console.log(`Barrels updated: ${barrelsUpdated}`);
        console.log(`Total postings merged: ${totalMerged}`);
        console.log(`Updated lexicon size: ${updatedLexicon.size}`);

    } catch (err) {
        console.error("\nCRITICAL ERROR:", err.message);
    }
}

main();
