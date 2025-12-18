const fs = require('fs');
const path = require('path');
const { Trie } = require('./trie'); // Trie data structure for fast prefix search

// --- Configuration ---
const VOCABULARY_INPUT_FILE = '../data/lexicon.json';
const MAX_SUGGESTIONS = 5;

/**
 * Loads lexicon and returns an array of unique words for Trie insertion
 */
function loadLexiconWords(filePath) {
    try {
        const vocabPath = path.resolve(__dirname, filePath);
        const raw = fs.readFileSync(vocabPath, 'utf8');
        const vocabulary = JSON.parse(raw);
        return Object.keys(vocabulary); // Extract only words
    } catch (err) {
        console.error("CRITICAL ERROR: Failed to load lexicon for Trie building.");
        throw err;
    }
}

/**
 * Main function: builds Trie and demonstrates autocomplete
 */
function main() {
    try {
        const allWords = loadLexiconWords(VOCABULARY_INPUT_FILE);
        console.log(`Building Trie with ${allWords.length} words...`);
        const trie = new Trie();

        const buildStartTime = Date.now();
        for (const word of allWords) {
            trie.insert(word);
        }
        console.log(`Trie built successfully in ${Date.now() - buildStartTime}ms.`);

        // --- Autocomplete demonstration ---
        const prefixes = ["cance", "astron", "psychol", "struct"];
        const projectTarget = 100; // Target response time in ms

        console.log("\n--- Real-Time Autocomplete Test ---");

        for (const prefix of prefixes) {
            const searchStartTime = Date.now();
            const suggestions = trie.autocomplete(prefix, MAX_SUGGESTIONS);
            const searchTime = Date.now() - searchStartTime;

            console.log(`\nQuery: "${prefix}"`);
            console.log(`Time: ${searchTime}ms (Target: <${projectTarget}ms)`);
            console.log(`Suggestions: ${suggestions.join(', ') || 'No suggestions found'}`);
        }

    } catch (err) {
        console.error("\nCRITICAL ERROR in Autocomplete Module:", err.message);
    }
}

main();
