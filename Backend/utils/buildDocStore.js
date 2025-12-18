const fs = require('fs');
const path = require('path');

// --- Configuration ---
const ARTICLES_INPUT_FILE = '../data/arxiv.json';
const OUTPUT_FILE = '../data/docStore.json';

/**
 * Main execution function to build and save the Document Store
 */
function main() {
    try {
        const articlesPath = path.join(__dirname, ARTICLES_INPUT_FILE);
        const outputPath = path.join(__dirname, OUTPUT_FILE);

        // Load articles JSON
        console.log(`Loading articles from: ${articlesPath}`);
        const rawData = fs.readFileSync(articlesPath, 'utf8');
        const articles = JSON.parse(rawData);
        console.log(`Loaded ${articles.length} articles.`);

        const docStore = {};
        let processedCount = 0;

        // Build Doc Store: map DocID to minimal metadata
        for (const article of articles) {
            if (!article || !article.id) continue;

            docStore[article.id] = {
                title: article.title,
                authors: article.authors || "N/A", // Fallback for missing authors
                categories: article.categories
                // Abstract excluded to keep store lightweight
            };
            processedCount++;
        }

        // Save Doc Store to file
        console.log("Saving Document Store...");
        fs.writeFileSync(outputPath, JSON.stringify(docStore, null, 2));

        // Summary
        console.log("\n--- Document Store Generation Complete ---");
        console.log(`Documents processed and stored: ${processedCount}`);
        console.log(`Saved to: ${path.resolve(__dirname, outputPath)}`);

    } catch (err) {
        console.error("\nCRITICAL ERROR:", err.message);
        console.error("Ensure your input file path and format are correct.");
    }
}

main();
