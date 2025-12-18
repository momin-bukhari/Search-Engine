const { Worker } = require('worker_threads');
const path = require('path');

const WORKER_SCRIPT = path.join(__dirname, 'appendIndex.js');

/**
 * Spawns a worker thread to run indexing asynchronously.
 * @param {Array<Object>} articles - Articles to be indexed.
 * @returns {Promise<Object>} Resolves with worker result when done.
 */
function runIncrementalIndexNonBlocking(articles) {
    return new Promise((resolve, reject) => {
        // Spawn worker with articles as input
        const worker = new Worker(WORKER_SCRIPT, { workerData: { articles } });

        // Listen for successful completion
        worker.on('message', (result) => {
            if (result.status === 'success') {
                resolve(result);
            } else {
                reject(new Error(result.message));
            }
        });

        // Handle worker errors
        worker.on('error', (err) => {
            console.error('[Manager] Worker Error:', err);
            reject(err);
        });

        // Detect abnormal exit
        worker.on('exit', (code) => {
            if (code !== 0) {
                console.error(`[Manager] Worker stopped with exit code ${code}`);
                // No action needed if already resolved/rejected
            }
        });
    });
}

module.exports = {
    runIncrementalIndex: runIncrementalIndexNonBlocking,
};
