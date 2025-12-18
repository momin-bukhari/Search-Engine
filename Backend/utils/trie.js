/**
 * Implements a Trie (Prefix Tree) for efficient prefix matching
 */
class TrieNode {
    constructor() {
        this.children = new Map(); // Map of character -> child TrieNode
        this.isEndOfWord = false;  // Marks end of a complete word
    }
}

class Trie {
    constructor() {
        this.root = new TrieNode();
    }

    /**
     * Inserts a word into the Trie
     * @param {string} word
     */
    insert(word) {
        let node = this.root;
        for (const char of word) {
            if (!node.children.has(char)) {
                node.children.set(char, new TrieNode());
            }
            node = node.children.get(char);
        }
        node.isEndOfWord = true;
    }

    /**
     * Returns the node corresponding to the end of a prefix
     * @param {string} prefix
     * @returns {TrieNode|null}
     */
    searchNode(prefix) {
        let node = this.root;
        for (const char of prefix) {
            if (!node.children.has(char)) return null;
            node = node.children.get(char);
        }
        return node;
    }

    /**
     * Recursively collects words starting from a given node
     * @param {TrieNode} node
     * @param {string} currentPrefix
     * @param {Array<string>} results
     * @param {number} maxResults
     */
    collectWords(node, currentPrefix, results, maxResults) {
        if (results.length >= maxResults) return;

        if (node.isEndOfWord) results.push(currentPrefix);

        // Iterate children alphabetically for consistent suggestion order
        const sortedChildren = Array.from(node.children.keys()).sort();
        for (const char of sortedChildren) {
            this.collectWords(
                node.children.get(char),
                currentPrefix + char,
                results,
                maxResults
            );
        }
    }

    /**
     * Returns top autocomplete suggestions for a given prefix
     * Time Complexity: O(L + R), L = prefix length, R = number of results
     * @param {string} prefix
     * @param {number} [limit=5]
     * @returns {Array<string>}
     */
    autocomplete(prefix, limit = 5) {
        const startNode = this.searchNode(prefix);
        const results = [];

        if (startNode) {
            this.collectWords(startNode, prefix, results, limit);
        }

        return results;
    }
}

module.exports = { Trie };
