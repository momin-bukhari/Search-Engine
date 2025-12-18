import { useState, useRef, useEffect } from 'react'; // useRef for timers, useEffect for cleanup
import './AdminIndexer.css'; 

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const POLLING_INTERVAL = 2000; // Poll search engine health every 2 seconds

function AdminIndexer() {
    const [jsonInput, setJsonInput] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    const [isIndexing, setIsIndexing] = useState(false);
    const [error, setError] = useState(null);
    
    const jobStartTimeRef = useRef(null); // Track job start time
    const pollTimerRef = useRef(null);    // Polling interval reference

    // Poll search engine health to detect when indexing is complete
    const checkIndexingStatus = async (startTime) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/health`);
            const data = await response.json();

            if (data.lastInitialized > startTime) {
                clearInterval(pollTimerRef.current);
                setIsIndexing(false);
                setStatusMessage("SUCCESS: Indexing and cache reload complete. New documents are searchable!");
                setJsonInput(''); // Clear input after success
            } else {
                // Animate status message to indicate background activity
                setStatusMessage(prev => {
                    const base = "Indexing job running in background";
                    if (prev.endsWith("...")) return base;
                    if (prev.endsWith("..")) return base + "...";
                    if (prev.endsWith(".")) return base + "..";
                    return base + ".";
                });
            }
        } catch (e) {
            clearInterval(pollTimerRef.current);
            setError("Indexing failed: Server connection lost or health check failed.");
            setIsIndexing(false);
        }
    };

    // Submit JSON articles to the search engine for indexing
    const handleIndexSubmit = async () => {
        if (isIndexing) return; // Prevent multiple submissions
        setIsIndexing(true);
        setError(null);
        setStatusMessage('Parsing data...');

        try {
            const articlesArray = JSON.parse(jsonInput);
            if (!Array.isArray(articlesArray)) throw new Error("Input must be a JSON array.");

            setStatusMessage(`Sending ${articlesArray.length} article(s) to the indexing service...`);
            jobStartTimeRef.current = Date.now(); // Record time before API call

            const response = await fetch(`${API_BASE_URL}/api/admin/index`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ articles: articlesArray }), 
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed to start indexing job.');

            setStatusMessage(`SUCCESS: Indexing job started. Monitoring status...`);

            // Start polling health endpoint
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = setInterval(() => {
                checkIndexingStatus(jobStartTimeRef.current);
            }, POLLING_INTERVAL);

        } catch (err) {
            setError(`Indexing Failed: ${err.message}`);
            setStatusMessage('');
            setIsIndexing(false);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        }
    };

    // Cleanup polling timer on component unmount
    useEffect(() => {
        return () => {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        };
    }, []); 

    return (
        <section className="admin-indexer">
            <h2>⚙️ Dynamic Content Indexer</h2>
            <p>Paste a valid JSON array of new articles below (matching `arxiv.json`).</p>
            
            <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder='[{"id": "2025.01", "title": "New Paper Title", ...}, {...}]'
                rows="10"
                disabled={isIndexing}
            />

            <button 
                onClick={handleIndexSubmit} 
                disabled={isIndexing}
                className="index-submit-button"
            >
                {isIndexing ? (
                    <>
                        <div className="button-spinner"></div>
                        Processing in Background... (Non-Blocking)
                    </>
                ) : (
                    'Index New Articles (Non-Blocking)'
                )}
            </button>

            {statusMessage && <p className="status-message">{statusMessage}</p>}
            {error && <p className="error-message">{error}</p>}
        </section>
    );
}

export default AdminIndexer;
