const fs = require('fs');
const path = require('path');
const { Writable } = require('stream');

// --- Configuration ---
const ARTICLES_INPUT_FILE = '../data/arxiv.json';
const VOCABULARY_INPUT_FILE = '../data/lexicon.json';
const OUTPUT_FILE = '../data/forwardIndex.json';

const MIN_WORD_LENGTH = 3;
const TOKEN_REGEX = /[a-z]+/g;

// Field identifiers used during ranking
const FIELD_TYPES = {
    TITLE: 1,
    ABSTRACT: 2,
    CATEGORIES: 3,
    AUTHORS: 4,
    SUBMITTER: 5
};

// Stop words to skip during indexing
const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "but", "by",
    "for", "if", "in", "is", "it", "no", "not", "of", "on",
    "or", "such", "that", "the", "their", "then", "there",
    "these", "they", "this", "to", "was", "will", "with",
    "from", "which", "can", "we", "i", "my", "your", "its",
    "all", "our"
]);

// Load vocabulary (word → wordId)
function loadVocabulary(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error(`ERROR: Failed to load vocabulary from ${path.resolve(filePath)}`);
        throw err;
    }
}

// Stream-save the forward index to avoid large JSON memory issues
function saveForwardIndexStream(filePath, dataMap) {
    const fullPath = path.resolve(__dirname, filePath);
    const stream = fs.createWriteStream(fullPath);
    let isFirst = true;

    return new Promise((resolve, reject) => {
        stream.on('error', reject);

        stream.write("{\n");

        for (const [docId, docEntry] of dataMap.entries()) {
            if (!isFirst) stream.write(",\n");

            const entryJson = JSON.stringify(docEntry);
            stream.write(`  "${docId}": ${entryJson}`);

            isFirst = false;
        }

        stream.write("\n}");
        stream.end(resolve);
    });
}

// Build forward index: DocID → { wordID: [ {pos, type}, ... ] }
function buildForwardIndex(articles, vocabulary) {
    const forwardIndex = new Map();
    let processed = 0;

    for (const article of articles) {
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

                    const wordId = vocabulary[token];
                    if (wordId) {
                        const hit = { pos: position, type: field.type };

                        if (!docEntry[wordId]) {
                            docEntry[wordId] = [];
                        }

                        docEntry[wordId].push(hit);
                    }

                    position++;
                }
            }

            if (Object.keys(docEntry).length > 0) {
                forwardIndex.set(docId, docEntry);
                processed++;
            }

        } catch (err) {
            console.error(`Skipping article ${docId}: ${err.message}`);
        }
    }

    console.log(`Forward index built for ${processed} documents.`);
    return forwardIndex;
}

// Main workflow
async function main() {
    try {
        const vocabPath = path.join(__dirname, VOCABULARY_INPUT_FILE);
        const articlesPath = path.join(__dirname, ARTICLES_INPUT_FILE);
        const outputPath = path.join(__dirname, OUTPUT_FILE);

        const vocabulary = loadVocabulary(vocabPath);
        console.log(`Loaded ${Object.keys(vocabulary).length} words from lexicon.`);

        const rawArticles = fs.readFileSync(articlesPath, 'utf8');
        const articles = JSON.parse(rawArticles);
        console.log(`Loaded ${articles.length} articles.`);

        const forwardIndexMap = buildForwardIndex(articles, vocabulary);

        console.log("Saving forward index (stream mode)...");
        await saveForwardIndexStream(outputPath, forwardIndexMap);

        console.log("\n--- Forward Index Generation Complete ---");
        console.log(`Indexed documents: ${forwardIndexMap.size}`);
        console.log(`Saved to: ${path.resolve(__dirname, outputPath)}`);

    } catch (err) {
        console.error("\nCRITICAL ERROR:", err.message);
    }
}

main();