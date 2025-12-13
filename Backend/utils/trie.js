/**
 * Implements a Trie (Prefix Tree) structure for efficient prefix matching.
 */
class TrieNode {
    constructor() {
        this.children = new Map(); // Stores mapping of character -> TrieNode
        this.isEndOfWord = false;
    }
}

class Trie {
    constructor() {
        this.root = new TrieNode();
    }

    /**
     * Inserts a word into the Trie.
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
     * Finds the node corresponding to the end of a given prefix.
     * @param {string} prefix
     * @returns {TrieNode | null}
     */
    searchNode(prefix) {
        let node = this.root;
        for (const char of prefix) {
            if (!node.children.has(char)) {
                return null;
            }
            node = node.children.get(char);
        }
        return node;
    }

    /**
     * Recursively collects all words starting from a given node.
     * @param {TrieNode} node 
     * @param {string} currentPrefix 
     * @param {Array<string>} results 
     * @param {number} maxResults 
     */
    collectWords(node, currentPrefix, results, maxResults) {
        if (results.length >= maxResults) {
            return;
        }

        if (node.isEndOfWord) {
            results.push(currentPrefix);
        }

        // Iterate through children in a defined order (alphabetical)
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
     * Main autocomplete function: searches for the top suggestions for a prefix.
     * Time Complexity: O(L + R), where L is prefix length, and R is the length 
     * of the returned suggestions (R is small and capped, making this very fast).
     * @param {string} prefix 
     * @param {number} [limit=5] - Max number of suggestions to return.
     * @returns {Array<string>} - List of suggested words.
     */
    autocomplete(prefix, limit = 5) {
        // Step 1: Find the node corresponding to the prefix (O(L))
        const startNode = this.searchNode(prefix);
        const results = [];

        if (startNode) {
            // Step 2: Recursively collect words from that node onwards (O(R))
            this.collectWords(startNode, prefix, results, limit);
        }

        return results;
    }
}

module.exports = { Trie };