const fs = require('fs');
const path = require('path');
// ⬅️ ADDED: Worker Thread API
const { parentPort, workerData } = require('worker_threads'); 

// --- Configuration ---
const LEXICON_FILE = '../data/lexicon.json';
const DOC_STORE_FILE = '../data/docStore.json'; 
const FORWARD_INDEX_FILE = '../data/forwardIndex.json'; 
const BARRELS_DIR = '../data/barrels';

const NUM_BARRELS = 64;           
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

// ⬅️ All helper functions remain the same (loadIndex, saveLexicon, findNextWordId, etc.)

function loadIndex(filePath, asMap = true) {
    try {
        const fullPath = path.resolve(__dirname, filePath);
        const raw = fs.readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(raw);
        return asMap ? new Map(Object.entries(parsed)) : parsed;
    } catch (err) {
        if (err.code === 'ENOENT') {
            return asMap ? new Map() : {};
        }
        console.error(`ERROR: Failed to load ${filePath}: ${err.message}`);
        throw err;
    }
}

function saveLexicon(filePath, data) {
    const fullPath = path.resolve(__dirname, filePath);
    const obj = data instanceof Map ? Object.fromEntries(data) : data;
    fs.writeFileSync(fullPath, JSON.stringify(obj, null, 2));
}

function findNextWordId(lexicon) {
    let maxId = 0;
    for (const id of lexicon.values()) {
        const n = parseInt(id);
        if (n > maxId) maxId = n;
    }
    return maxId + 1;
}

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

function saveBarrel(barrelIndex, dataMap) {
    const barrelPath = path.resolve(__dirname, BARRELS_DIR, `barrel_${barrelIndex}.json`);
    fs.writeFileSync(barrelPath, JSON.stringify(Object.fromEntries(dataMap), null, 2));
}

function updateAndSaveDocStore(newArticles, docStore) {
    const fullPath = path.resolve(__dirname, DOC_STORE_FILE);
    
    const newMetadata = {};
    for (const article of newArticles) {
        if (!article || !article.id) continue;
        newMetadata[article.id] = {
            title: article.title,
            authors: article.authors || "N/A",
            categories: article.categories
        };
    }
    
    const updatedStore = { ...docStore, ...newMetadata };
    fs.writeFileSync(fullPath, JSON.stringify(updatedStore, null, 2));
    
    return updatedStore;
}

function updateAndSaveForwardIndex(newForwardEntries, existingForwardIndex) {
    const fullPath = path.resolve(__dirname, FORWARD_INDEX_FILE);
    
    const updatedForwardIndex = { ...existingForwardIndex, ...newForwardEntries };
    fs.writeFileSync(fullPath, JSON.stringify(updatedForwardIndex, null, 2));
    
    return updatedForwardIndex;
}


function processNewArticles(articlesToProcess, lexicon, nextWordId) {
    const newPostingsByBarrel = new Map();
    const newForwardEntries = {}; 
    let processed = 0;
    let totalHits = 0;

    for (const article of articlesToProcess) {
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

                    // 1. Build the Forward Index entry (docEntry)
                    if (!docEntry[wordId]) docEntry[wordId] = [];
                    docEntry[wordId].push(hit);

                    totalHits++;
                    position++;
                }
            }

            if (Object.keys(docEntry).length === 0) continue;

            // 2. Generate Inverted Index Postings for Barrels
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
            
            // 3. Store the final Forward Index entry for saving
            newForwardEntries[docId] = docEntry;
            processed++;

        } catch (err) {
            console.error(`Skipping article ${docId}: ${err.message}`);
        }
    }

    return {
        newPostingsByBarrel,
        newForwardEntries, 
        updatedLexicon: lexicon,
        newNextWordId: nextWordId,
        processedCount: processed,
        totalNewHits: totalHits
    };
}

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

// ⬅️ MODIFIED: The main logic now runs inside the worker thread.
function runIndexingJob(newArticles) {
    try {
        // 1. Load Indexes
        const lexicon = loadIndex(LEXICON_FILE);
        const docStore = loadIndex(DOC_STORE_FILE, false); 
        const forwardIndex = loadIndex(FORWARD_INDEX_FILE, false); 
        const existingDocIds = new Set(Object.keys(docStore));
        
        console.log(`[Worker] Articles in batch received: ${newArticles.length}`);

        // 2. Filter Duplicates (Idempotence)
        const articlesToProcess = newArticles.filter(article => 
            article.id && !existingDocIds.has(article.id)
        );
        
        console.log(`[Worker] Unique new articles to index: ${articlesToProcess.length}`);

        if (articlesToProcess.length === 0) {
            return {
                status: 'success',
                indexedCount: 0,
                message: "No unique articles were found in the batch."
            };
        }

        // 3. Process Articles 
        let nextWordId = findNextWordId(lexicon);
        const {
            newPostingsByBarrel,
            newForwardEntries, 
            updatedLexicon,
            processedCount,
        } = processNewArticles(articlesToProcess, lexicon, nextWordId);

        // 4. Merge New Postings into Barrels (Synchronous I/O isolated here)
        const { barrelsUpdated } = mergeNewPostings(newPostingsByBarrel);

        // 5. Save ALL updated indices back to disk
        saveLexicon(LEXICON_FILE, updatedLexicon);
        updateAndSaveDocStore(articlesToProcess, docStore);
        updateAndSaveForwardIndex(newForwardEntries, forwardIndex); 

        console.log("\n--- Incremental Indexing Complete (Worker) ---");
        console.log(`New documents indexed: ${processedCount}`);
        
        return {
            status: 'success',
            indexedCount: processedCount,
            message: `Successfully indexed ${processedCount} documents.`,
            // Sending a flag to the main thread to signal cache reload is done at the manager level
        };

    } catch (err) {
        console.error("\nCRITICAL ERROR (Worker):", err.message);
        return {
            status: 'error',
            message: err.message
        };
    }
}

// ⬅️ EXPORT/EXECUTION: When this file is run as a Worker, it listens for data.
if (parentPort) {
    // This is the entry point when spawned as a Worker Thread
    const result = runIndexingJob(workerData.articles);
    // Send result back to the main thread
    parentPort.postMessage(result);
} else {
    // Fallback for standalone execution (if needed)
    console.warn("appendIndex.js is designed to run as a Worker Thread.");
}

// ⬅️ Removed 'module.exports' for runIncrementalIndex as it's no longer a standard module export.