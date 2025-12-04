const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');

// --- Configuration ---
const FORWARD_INDEX_INPUT_FILE = '../data/forwardIndex.json';
const OUTPUT_FILE = '../data/invertedIndex.json';

// Load the forward index JSON (DocID → { wordID: [hits...] })
function loadForwardIndex(filePath) {
    try {
        const fullPath = path.resolve(__dirname, filePath);
        const raw = fs.readFileSync(fullPath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error(`ERROR: Failed to load Forward Index from ${path.resolve(__dirname, filePath)}`);
        throw err;
    }
}

// Build inverted index: wordID → [ { docId, hits: [...] } ]
function buildInvertedIndex(forwardIndex) {
    const invertedIndex = {};
    const docIds = Object.keys(forwardIndex);
    let totalHits = 0;

    console.log(`Starting inversion for ${docIds.length} documents...`);

    for (const docId of docIds) {
        const docTerms = forwardIndex[docId];

        for (const wordId in docTerms) {
            if (!Object.prototype.hasOwnProperty.call(docTerms, wordId)) continue;

            const hitList = docTerms[wordId];
            const posting = { docId, hits: hitList };

            if (!invertedIndex[wordId]) {
                invertedIndex[wordId] = [];
            }

            invertedIndex[wordId].push(posting);
            totalHits += hitList.length;
        }
    }

    console.log(`Total hits indexed: ${totalHits}`);
    return invertedIndex;
}

// Stream the inverted index to disk to avoid JSON memory overflow issues
function saveInvertedIndexStream(filePath, dataObject) {
    const fullPath = path.resolve(__dirname, filePath);
    const stream = fs.createWriteStream(fullPath);
    let isFirst = true;

    return new Promise((resolve, reject) => {
        stream.on('error', reject);

        stream.write("{\n");

        for (const wordId in dataObject) {
            if (!Object.prototype.hasOwnProperty.call(dataObject, wordId)) continue;

            if (!isFirst) {
                stream.write(",\n");
            }

            const postingsJson = JSON.stringify(dataObject[wordId]);
            stream.write(`  "${wordId}": ${postingsJson}`);
            isFirst = false;
        }

        stream.write("\n}");
        stream.end(resolve);
    });
}

// Main execution flow (async because streaming uses Promises)
async function main() {
    try {
        const forwardIndexPath = path.join(__dirname, FORWARD_INDEX_INPUT_FILE);
        const outputPath = path.join(__dirname, OUTPUT_FILE);

        // Load forward index
        const forwardIndex = loadForwardIndex(forwardIndexPath);

        // Build inverted index data structure
        const invertedIndex = buildInvertedIndex(forwardIndex);

        // Stream save to avoid "Invalid string length" memory errors
        console.log("Saving inverted index (stream mode)...");
        await saveInvertedIndexStream(outputPath, invertedIndex);

        console.log("\n--- Inverted Index Generation Complete ---");
        console.log(`Unique terms: ${Object.keys(invertedIndex).length}`);
        console.log(`Saved to: ${path.resolve(__dirname, outputPath)}`);

    } catch (err) {
        console.error("\nCRITICAL ERROR:", err.message);
    }
}

main();
