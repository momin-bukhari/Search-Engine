// indexerManager.js
const { Worker } = require('worker_threads');
const path = require('path');

const WORKER_SCRIPT = path.join(__dirname, 'appendIndex.js');

/**
 * Spawns a worker thread to execute the synchronous indexing logic.
 * The worker is completely isolated from the main Node.js event loop.
 * * @param {Array<Object>} articles - Array of articles to index.
 * @returns {Promise<Object>} - Promise that resolves when the worker finishes.
 */
function runIncrementalIndexNonBlocking(articles) {
    return new Promise((resolve, reject) => {
        // Create the worker, passing the articles array as workerData
        const worker = new Worker(WORKER_SCRIPT, {
            workerData: { articles }
        });

        // Listen for success message from the worker
        worker.on('message', (result) => {
            if (result.status === 'success') {
                resolve(result);
            } else {
                reject(new Error(result.message));
            }
        });

        // Listen for errors from the worker (e.g., syntax errors)
        worker.on('error', (err) => {
            console.error('[Manager] Worker Error:', err);
            reject(err);
        });

        // Listen for the worker exiting
        worker.on('exit', (code) => {
            if (code !== 0) {
                // If the worker crashed for an unhandled reason
                console.error(`[Manager] Worker stopped with exit code ${code}`);
                // Only reject if it hasn't resolved/rejected already (via 'error' listener)
            }
        });
    });
}

module.exports = {
    runIncrementalIndex: runIncrementalIndexNonBlocking,
};