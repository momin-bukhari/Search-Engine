const fs = require('fs');
const path = require('path');
const readline = require('readline');

// --- Configuration ---
const GLOVE_FILE = '../data/glove.6B.50d.txt';
const SIMILARITY_THRESHOLD = 0.65; // 0.0 to 1.0 (Higher = stricter matching)
const MAX_SYNONYMS = 3;

class SemanticModel {
    constructor() {
        this.vectors = new Map(); // Stores word -> [vector]
        this.vocab = []; // Quick list of available words for iteration
        this.isLoaded = false;
    }

    /**
     * Loads GloVe vectors into memory.
     * Note: We only load words that are actually in our Search Engine Lexicon
     * to save RAM.
     */
    async load(targetLexiconSet) {
        console.log(`[SemanticModel] Loading GloVe vectors from ${GLOVE_FILE}...`);
        const startTime = Date.now();

        const fileStream = fs.createReadStream(path.join(__dirname, GLOVE_FILE));
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            // Line format: "word 0.123 -0.421 ..."
            const parts = line.split(' ');
            const word = parts[0];

            // OPTIMIZATION: Only load vector if this word exists in our dataset
            // or if it's a very common English word.
            // For now, let's load matches to ensure we can expand properly.
            if (targetLexiconSet.has(word)) {
                const vector = parts.slice(1).map(Number);
                this.vectors.set(word, vector);
                this.vocab.push(word);
            }
        }

        this.isLoaded = true;
        console.log(`[SemanticModel] Loaded ${this.vectors.size} vectors in ${(Date.now() - startTime)}ms.`);
    }

    /**
     * The Mathematical Core: Cosine Similarity
     * Formula: (A . B) / (||A|| * ||B||)
     */
    cosineSimilarity(vecA, vecB) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }

        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Finds the top N synonyms for a given word.
     */
    findSynonyms(inputWord) {
        if (!this.isLoaded || !this.vectors.has(inputWord)) return [];

        const inputVector = this.vectors.get(inputWord);
        const candidates = [];

        // Brute-force compare against all loaded vectors (O(N))
        // Since we filtered by Lexicon, N is ~45k, which is fast enough (approx 50-100ms)
        for (const word of this.vocab) {
            if (word === inputWord) continue;

            const similarity = this.cosineSimilarity(inputVector, this.vectors.get(word));
            
            if (similarity >= SIMILARITY_THRESHOLD) {
                candidates.push({ word, score: similarity });
            }
        }

        // Sort by score (descending) and take top N
        return candidates
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_SYNONYMS)
            .map(c => c.word);
    }
}

module.exports = new SemanticModel();