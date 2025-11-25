const fs = require('fs');
const path = require('path');

// --- Configuration ---
// Input files must be in the same directory as this script
const ARTICLES_INPUT_FILE = './arxiv.json';
const VOCABULARY_INPUT_FILE = './lexicon.json';
const OUTPUT_FILE = './forwardIndex.json';

const MIN_WORD_LENGTH = 3;
const TOKEN_REGEX = /[a-z]+/g;

// Stop words list must match lexicon generation for consistency
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by",
  "for", "if", "in", "is", "it", "no", "not", "of", "on",
  "or", "such", "that", "the", "their", "then", "there", "these",
  "they", "this", "to", "was", "will", "with", "from", "which",
  "can", "we", "i", "my", "your", "its", "all", "our"
]);

/**
 * Load vocabulary (word → wordId) from the lexicon file.
 */
function loadVocabulary(filePath) {
    try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(rawData);
    } catch (err) {
        console.error(`ERROR: Could not load vocabulary from ${filePath}. Ensure lexicon exists.`);
        throw err;
    }
}

/**
 * Build Forward Index: DocID → { WordID: TermFrequency, ... }
 */
function buildForwardIndex(articles, vocabulary) {
    const forwardIndex = new Map();
    let processedCount = 0;

    for (const article of articles) {
        if (!article || !article.id) continue;
        const docId = article.id;
        const docEntry = {}; // { wordId: frequency }

        try {
            // Fields to index (same as lexicon script)
            const fields = [
                article.submitter,
                article.authors,
                article.title,
                article.abstract,
                article.categories
            ].filter(Boolean);

            if (fields.length === 0) continue;

            // Merge fields and tokenize
            const text = fields.join(' ').toLowerCase();
            const tokens = text.match(TOKEN_REGEX) || [];

            for (const token of tokens) {
                if (token.length < MIN_WORD_LENGTH || STOP_WORDS.has(token)) continue;

                const wordId = vocabulary[token];
                if (wordId) {
                    // Count term frequency
                    docEntry[wordId] = (docEntry[wordId] || 0) + 1;
                }
            }

            // Only add documents that have indexed words
            if (Object.keys(docEntry).length > 0) {
                forwardIndex.set(docId, docEntry);
                processedCount++;
            }

        } catch (err) {
            console.error(`Skipping corrupted article (ID: ${docId}): ${err.message}`);
            continue;
        }
    }

    console.log(`Successfully built forward index for ${processedCount} documents.`);
    return forwardIndex;
}

/**
 * Main execution
 */
function main() {
    try {
        const vocabPath = path.join(__dirname, VOCABULARY_INPUT_FILE);
        const articlesPath = path.join(__dirname, ARTICLES_INPUT_FILE);
        const outputPath = path.join(__dirname, OUTPUT_FILE);

        // 1. Load vocabulary
        const vocabulary = loadVocabulary(vocabPath);
        console.log(`Loaded ${Object.keys(vocabulary).length} unique words from ${VOCABULARY_INPUT_FILE}.`);

        // 2. Load articles
        const rawArticlesData = fs.readFileSync(articlesPath, 'utf8');
        const articles = JSON.parse(rawArticlesData);
        console.log(`Loaded ${articles.length} articles from ${ARTICLES_INPUT_FILE}.`);

        // 3. Build forward index
        const forwardIndexMap = buildForwardIndex(articles, vocabulary);

        // Convert Map → plain object for JSON
        const forwardIndexObj = Object.fromEntries(forwardIndexMap);

        // 4. Save forward index
        fs.writeFileSync(outputPath, JSON.stringify(forwardIndexObj, null, 2));

        console.log("\n--- Forward Index Generation Complete ---");
        console.log(`Total indexed documents: ${forwardIndexMap.size}`);
        console.log(`File written to: ${outputPath}`);

    } catch (err) {
        console.error("\nCRITICAL ERROR:", err.message);
    }
}

main();
