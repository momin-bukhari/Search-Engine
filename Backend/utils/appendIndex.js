const fs = require('fs');
const path = require('path');

// Configuration

const APPEND_INPUT_FILE = '../data/appendArxiv.json';   
const LEXICON_FILE = '../data/lexicon.json';    
const FORWARD_INDEX_FILE = '../data/forwardIndex.json';
const INVERTED_INDEX_FILE = '../data/invertedIndex.json';

const MIN_WORD_LENGTH = 3;
const TOKEN_REGEX = /[a-z]+/g;

// Common stopwords to ignore during tokenization
const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "but", "by",
    "for", "if", "in", "is", "it", "no", "not", "of", "on",
    "or", "such", "that", "the", "their", "then", "there", "these",
    "they", "this", "to", "was", "will", "with", "from", "which",
    "can", "we", "i", "my", "your", "its", "all", "our"
]);

/**
 * Loads a JSON file. If `asMap` is true, converts the object into a Map.
 */
function loadIndex(filePath, asMap = true) {
    try {
        const fullPath = path.join(__dirname, filePath);
        const rawData = fs.readFileSync(fullPath, 'utf8');
        const obj = JSON.parse(rawData);

        return asMap ? new Map(Object.entries(obj)) : obj;
    } catch (err) {
        console.error(`ERROR: Failed to load ${filePath}.`);
        throw err;
    }
}

/**
 * Saves a Map or object to a JSON file.
 * Maps are converted back into plain objects before serialization.
 */
function saveIndex(filePath, data) {
    const fullPath = path.join(__dirname, filePath);
    const obj = data instanceof Map ? Object.fromEntries(data) : data;
    fs.writeFileSync(fullPath, JSON.stringify(obj, null, 2));
}

/**
 * Returns the next unused wordId.
 * We scan through lexicon values and pick max + 1.
 */
function findNextWordId(lexicon) {
    let maxId = 0;
    for (const id of lexicon.values()) {
        if (id > maxId) maxId = id;
    }
    return maxId + 1;
}

// Core indexing logic

/**
 * Processes new articles:
 *   - updates the lexicon when new words appear
 *   - builds new forward index entries (per-document word counts)
 *   - builds new inverted index postings (word → document list)
 */
function processNewArticles(newArticles, lexicon, nextWordId) {
    const newForwardEntries = new Map();
    const newInvertedPostings = new Map();
    let processedCount = 0;

    for (const article of newArticles) {
        if (!article || !article.id) continue;

        const docId = article.id;
        const docEntry = {};  // wordId → term frequency

        try {
            // Combine all text fields used for indexing
            const fields = [
                article.submitter,
                article.authors,
                article.title,
                article.abstract,
                article.categories
            ].filter(Boolean);

            if (fields.length === 0) continue;

            const text = fields.join(' ').toLowerCase();
            const tokens = text.match(TOKEN_REGEX) || [];

            // Tokenize + update lexicon + compute term frequency
            for (const token of tokens) {
                if (token.length < MIN_WORD_LENGTH || STOP_WORDS.has(token)) continue;

                let wordId = lexicon.get(token);

                // New word → assign new ID
                if (!wordId) {
                    wordId = String(nextWordId++);
                    lexicon.set(token, wordId);
                }

                docEntry[wordId] = (docEntry[wordId] || 0) + 1;
            }

            // Skip empty docs
            if (Object.keys(docEntry).length === 0) continue;

            newForwardEntries.set(docId, docEntry);

            // Build postings for inverted index
            for (const wId in docEntry) {
                const posting = { docId, tf: docEntry[wId] };
                const list = newInvertedPostings.get(wId) || [];
                list.push(posting);
                newInvertedPostings.set(wId, list);
            }

            processedCount++;

        } catch (err) {
            console.error(`Skipping article ${docId}: ${err.message}`);
        }
    }

    return {
        newForwardEntries,
        newInvertedPostings,
        updatedLexicon: lexicon,
        newNextWordId: nextWordId,
        processedCount
    };
}

function main() {
    try {
        // Load existing indices into memory
        let lexicon = loadIndex(LEXICON_FILE);
        let forwardIndex = loadIndex(FORWARD_INDEX_FILE);
        let invertedIndex = loadIndex(INVERTED_INDEX_FILE);
        const newArticles = loadIndex(APPEND_INPUT_FILE, false);

        console.log(`Loaded ${lexicon.size} words.`);
        console.log(`Loaded ${forwardIndex.size} documents.`);
        console.log(`Incoming articles: ${newArticles.length}`);

        let nextWordId = findNextWordId(lexicon);

        // Process and index new articles
        const {
            newForwardEntries,
            newInvertedPostings,
            updatedLexicon,
            processedCount
        } = processNewArticles(newArticles, lexicon, nextWordId);

        // Merge new forward index entries
        for (const [docId, entry] of newForwardEntries) {
            forwardIndex.set(docId, entry);
        }

        // Merge new inverted index postings
        for (const [wordId, postings] of newInvertedPostings) {
            const existing = invertedIndex.get(wordId) || [];
            existing.push(...postings);
            invertedIndex.set(wordId, existing);
        }

        // Save updated indices to disk
        saveIndex(LEXICON_FILE, updatedLexicon);
        saveIndex(FORWARD_INDEX_FILE, forwardIndex);
        saveIndex(INVERTED_INDEX_FILE, invertedIndex);

        console.log("\n--- Incremental Indexing Complete ---");
        console.log(`Indexed new documents: ${processedCount}`);
        console.log(`Total words: ${updatedLexicon.size}`);
        console.log(`Total documents: ${forwardIndex.size}`);

    } catch (err) {
        console.error("\nCRITICAL ERROR:", err.message);
    }
}

main();