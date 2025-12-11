const fs = require('fs');
const path = require('path');
const { Trie } = require('./trie'); // Import the Trie class

// --- Configuration ---
const VOCABULARY_INPUT_FILE = '../data/lexicon.json';
const MAX_SUGGESTIONS = 5;

/**
 * Loads the lexicon and returns an array of unique words.
 */
function loadLexiconWords(filePath) {
    try {
        const vocabPath = path.resolve(__dirname, filePath);
        const raw = fs.readFileSync(vocabPath, 'utf8');
        const vocabulary = JSON.parse(raw);
        // We only need the keys (the words) for the Trie
        return Object.keys(vocabulary); 
    } catch (err) {
        console.error("CRITICAL ERROR: Failed to load lexicon for Trie building.");
        throw err;
    }
}

/**
 * Main function to build the Trie and demonstrate autocomplete.
 */
function main() {
    try {
        const allWords = loadLexiconWords(VOCABULARY_INPUT_FILE);
        const wordCount = allWords.length;
        
        console.log(`Building Trie with ${wordCount} words from lexicon...`);
        const trie = new Trie();
        
        const buildStartTime = Date.now();
        
        for (const word of allWords) {
            trie.insert(word);
        }
        
        const buildTime = Date.now() - buildStartTime;
        console.log(`Trie built successfully in ${buildTime}ms.`);
        
        // --- Demonstration of Autocomplete ---
        
        const prefixes = ["cance", "astron", "psychol", "struct"];
        const projectTarget = 100; // ms

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