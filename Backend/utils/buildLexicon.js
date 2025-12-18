const fs = require('fs');
const path = require('path');

// --- Configuration ---
const INPUT_FILE = '../data/arxiv.json';
const OUTPUT_FILE = '../data/lexicon.json';
const MIN_WORD_LENGTH = 3;

// Common words to ignore
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by",
  "for", "if", "in", "is", "it", "no", "not", "of", "on",
  "or", "such", "that", "the", "their", "then", "there", "these",
  "they", "this", "to", "was", "will", "with", "from", "which",
  "can", "we", "i", "my", "your", "its", "all", "our"
]);

// Regex to extract lowercase words only
const TOKEN_REGEX = /[a-z]+/g;

/**
 * Build a vocabulary of unique words from articles
 */
function buildVocabulary(articles) {
  const vocabulary = new Map();
  let nextWordId = 1;
  let processedCount = 0;

  for (const article of articles) {
    if (!article) continue;

    try {
      // Combine all text fields for token extraction
      const fields = [
        article.submitter,
        article.authors,
        article.title,
        article.abstract,
        article.categories
      ].filter(Boolean);

      if (fields.length === 0) continue;

      for (const field of fields) {
        const tokens = field.toLowerCase().match(TOKEN_REGEX);
        if (!tokens) continue;

        for (const token of tokens) {
          if (token.length < MIN_WORD_LENGTH) continue; // Skip short words
          if (STOP_WORDS.has(token)) continue;          // Skip stop words

          // Assign a unique ID to each new word
          if (!vocabulary.has(token)) {
            vocabulary.set(token, nextWordId++);
          }
        }
      }

      processedCount++;

    } catch (err) {
      console.error(`Skipping corrupted article: ${err.message}`);
    }
  }

  return { vocabulary, processedCount };
}

/**
 * Main execution
 */
function main() {
  try {
    const inputPath = path.join(__dirname, INPUT_FILE);
    const outputPath = path.join(__dirname, OUTPUT_FILE);

    // Load and parse JSON file
    const rawData = fs.readFileSync(inputPath, 'utf8');
    const articles = JSON.parse(rawData);

    console.log(`Loaded ${articles.length} articles.`);

    // Generate the vocabulary
    const { vocabulary, processedCount } = buildVocabulary(articles);

    // Convert Map to plain object for JSON
    const vocabObj = Object.fromEntries(vocabulary);

    // Write output file
    fs.writeFileSync(outputPath, JSON.stringify(vocabObj, null, 2));

    // Summary
    console.log("\n--- Lexicon Generation Complete ---");
    console.log(`Documents loaded:    ${articles.length}`);
    console.log(`Documents indexed:   ${processedCount}`);
    console.log(`Documents skipped:   ${articles.length - processedCount}`);
    console.log(`Unique words:        ${vocabulary.size}`);
    console.log(`File written to:     ${outputPath}`);

  } catch (err) {
    console.error("CRITICAL ERROR:", err.message);
  }
}

main();
