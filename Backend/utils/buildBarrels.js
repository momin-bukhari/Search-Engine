const fs = require('fs');
const path = require('path');

// --- Configuration ---
const INVERTED_INDEX_INPUT_FILE = '../data/invertedIndex.json';
const OUTPUT_DIR = '../data/barrels'; 
// The chosen number of barrels for partitioning
const NUM_BARRELS = 64; 

// Loads the Inverted Index (WordID -> PostingList) from the input file.

function loadInvertedIndex(relativeFilePath) {
    try {
        const fullPath = path.resolve(__dirname, relativeFilePath); 
        
        const rawData = fs.readFileSync(fullPath, 'utf8');
        // Returning a Map for efficient data access
        return new Map(Object.entries(JSON.parse(rawData)));
    } catch (err) {
        // Log the actual full path attempted
        console.error(`ERROR: Could not load Inverted Index. Path attempted: ${path.resolve(__dirname, relativeFilePath)}`);
        throw err;
    }
}

// Saves a barrel Map to a JSON file.
 
function saveBarrel(barrelData, barrelIndex) {
    // Construct the absolute output path
    const fullOutputPath = path.resolve(__dirname, OUTPUT_DIR, `barrel_${barrelIndex}.json`);
    
    // Convert Map back to a plain object for JSON serialization
    const outputObj = Object.fromEntries(barrelData);
    fs.writeFileSync(fullOutputPath, JSON.stringify(outputObj, null, 2));
    
    return fullOutputPath;
}

/**
 * Partitions the inverted index into multiple barrel files 
 * using the dynamic modulo hashing scheme (WordID % NUM_BARRELS).
 */

function partitionAndSaveBarrels(invertedIndex) {
    // Initialize barrels as an array of Maps for efficient data accumulation
    const barrels = Array.from({ length: NUM_BARRELS }, () => new Map());
    
    console.log(`Starting dynamic partitioning into ${NUM_BARRELS} barrels...`);
    
    let totalPostings = 0;
    let wordsPartitioned = 0;

    // Iterate through the entire inverted index
    for (const [wordIdStr, postings] of invertedIndex.entries()) {
        const wordId = parseInt(wordIdStr);
        
        // Dynamic Partitioning Logic: WordID Modulo NUM_BARRELS
        const barrelIdx = wordId % NUM_BARRELS; 
        
        // Add the WordID's posting list to the correct barrel Map
        barrels[barrelIdx].set(wordIdStr, postings);
        
        totalPostings += postings.length;
        wordsPartitioned++;
    }

    // Save each barrel to its file
    for (let i = 0; i < NUM_BARRELS; i++) {
        const barrelMap = barrels[i];
        if (barrelMap.size > 0) {
            const filePath = saveBarrel(barrelMap, i);
            console.log(`Saved barrel_${i}.json (${barrelMap.size} words) to ${filePath}`);
        }
    }

    console.log(`\n--- Dynamic Barrel Generation Complete ---`);
    console.log(`Total words partitioned: ${wordsPartitioned}`);
    console.log(`Total postings distributed: ${totalPostings}`);
}
 
function main() {
    try {
        //Load the Inverted Index
        const invertedIndex = loadInvertedIndex(INVERTED_INDEX_INPUT_FILE);
        
        //Partition and save the barrels
        partitionAndSaveBarrels(invertedIndex);

    } catch (err) {
        console.error("\nCRITICAL ERROR:", err.message);
    }
}

main();