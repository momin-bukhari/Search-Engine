const fs = require('fs');
const path = require('path');

// --- Configuration ---
const ARTICLES_INPUT_FILE = '../data/arxiv.json';
const OUTPUT_FILE = '../data/docStore.json';

/**
 * Main execution function to build and save the Document Store.
 */
function main() {
    try {
        const articlesPath = path.join(__dirname, ARTICLES_INPUT_FILE);
        const outputPath = path.join(__dirname, OUTPUT_FILE);

        // 1. Load Articles
        console.log(`Loading articles from: ${articlesPath}`);
        const rawData = fs.readFileSync(articlesPath, 'utf8');
        const articles = JSON.parse(rawData);
        console.log(`Loaded ${articles.length} articles.`);

        const docStore = {};
        let processedCount = 0;

        // 2. Build the Doc Store Map (DocID -> essential metadata)
        for (const article of articles) {
            if (!article || !article.id) continue;

            // Store only the minimal fields needed for the search result display
            docStore[article.id] = {
                title: article.title,
                authors: article.authors || "N/A", // Handle potentially missing fields
                categories: article.categories
                // Abstract is excluded to keep the store small, only fetch on click/detail page
            };
            processedCount++;
        }

        // 3. Save the Doc Store
        console.log("Saving Document Store...");
        fs.writeFileSync(outputPath, JSON.stringify(docStore, null, 2));

        console.log("\n--- Document Store Generation Complete ---");
        console.log(`Documents processed and stored: ${processedCount}`);
        console.log(`Saved to: ${path.resolve(__dirname, outputPath)}`);

    } catch (err) {
        console.error("\nCRITICAL ERROR:", err.message);
        console.error("Ensure your input file path and format are correct.");
    }
}

main();