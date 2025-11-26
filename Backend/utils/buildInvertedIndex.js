const fs = require('fs');
const path = require('path');

// --- Configuration ---
const FORWARD_INDEX_INPUT_FILE = '../data/forwardIndex.json';
const OUTPUT_FILE = '../data/invertedIndex.json';

/**
 * Load Forward Index (DocID -> { WordID: TF, ... }) from file
 */
function loadForwardIndex(filePath) {
    try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(rawData);
    } catch (err) {
        console.error(`ERROR: Could not load Forward Index from ${filePath}. Ensure the file exists.`);
        throw err;
    }
}

/**
 * Build Inverted Index: WordID -> [ { docId: "...", tf: N }, ... ]
 * Converts the forward index into a postings list per term.
 */
function buildInvertedIndex(forwardIndex) {
    const invertedIndex = {};
    const docIds = Object.keys(forwardIndex);
    let totalPostings = 0;

    console.log(`Starting inversion for ${docIds.length} documents...`);

    // For each document, iterate its terms and populate the inverted index
    for (const docId of docIds) {
        const docTerms = forwardIndex[docId]; // WordID -> TF map

        for (const wordId in docTerms) {
            if (Object.prototype.hasOwnProperty.call(docTerms, wordId)) {
                const termFrequency = docTerms[wordId];

                // Posting object: docId + term frequency
                const posting = { docId, tf: termFrequency };

                // Initialize postings list if this WordID is new
                if (!invertedIndex[wordId]) invertedIndex[wordId] = [];

                // Append posting
                invertedIndex[wordId].push(posting);
                totalPostings++;
            }
        }
    }

    console.log(`Total postings generated: ${totalPostings}`);
    return invertedIndex;
}

/**
 * Main execution
 */
function main() {
    try {
        const forwardIndexPath = path.join(__dirname, FORWARD_INDEX_INPUT_FILE);
        const outputPath = path.join(__dirname, OUTPUT_FILE);

        // 1. Load Forward Index
        const forwardIndex = loadForwardIndex(forwardIndexPath);

        // 2. Build Inverted Index
        const invertedIndex = buildInvertedIndex(forwardIndex);

        // 3. Save Inverted Index
        fs.writeFileSync(outputPath, JSON.stringify(invertedIndex, null, 2));

        console.log("\n--- Inverted Index Generation Complete ---");
        console.log(`Unique terms indexed: ${Object.keys(invertedIndex).length}`);
        console.log(`File written to: ${outputPath}`);

    } catch (err) {
        console.error("\nCRITICAL ERROR:", err.message);
    }
}

main();
