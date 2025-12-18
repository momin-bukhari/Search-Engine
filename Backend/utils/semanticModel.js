const fs = require('fs');
const path = require('path');
const readline = require('readline');

// --- Configuration ---
const GLOVE_FILE = '../data/glove.6B.50d.txt';
const SIMILARITY_THRESHOLD = 0.65; // Higher = stricter match
const MAX_SYNONYMS = 3;

/**
 * SemanticModel loads GloVe vectors for lexicon words
 * and provides synonym lookup using cosine similarity.
 */
class SemanticModel {
    constructor() {
        this.vectors = new Map(); // word -> vector
        this.vocab = [];          // list of loaded words for iteration
        this.isLoaded = false;
    }

    /**
     * Loads GloVe vectors, filtering only words present in target lexicon
     */
    async load(targetLexiconSet) {
        console.log(`[SemanticModel] Loading GloVe vectors from ${GLOVE_FILE}...`);
        const startTime = Date.now();

        const fileStream = fs.createReadStream(path.join(__dirname, GLOVE_FILE));
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

        for await (const line of rl) {
            const parts = line.split(' ');
            const word = parts[0];

            if (targetLexiconSet.has(word)) {
                const vector = parts.slice(1).map(Number);
                this.vectors.set(word, vector);
                this.vocab.push(word);
            }
        }

        this.isLoaded = true;
        console.log(`[SemanticModel] Loaded ${this.vectors.size} vectors in ${Date.now() - startTime}ms.`);
    }

    /**
     * Cosine similarity between two vectors
     */
    cosineSimilarity(vecA, vecB) {
        let dotProduct = 0, normA = 0, normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] ** 2;
            normB += vecB[i] ** 2;
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Returns top N synonyms for a word
     */
    findSynonyms(inputWord) {
        if (!this.isLoaded || !this.vectors.has(inputWord)) return [];

        const inputVector = this.vectors.get(inputWord);
        const candidates = [];

        for (const word of this.vocab) {
            if (word === inputWord) continue;
            const similarity = this.cosineSimilarity(inputVector, this.vectors.get(word));
            if (similarity >= SIMILARITY_THRESHOLD) {
                candidates.push({ word, score: similarity });
            }
        }

        return candidates
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_SYNONYMS)
            .map(c => c.word);
    }
}

module.exports = new SemanticModel();
