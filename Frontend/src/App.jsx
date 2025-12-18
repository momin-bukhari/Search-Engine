import { useState } from 'react';
import SearchBar from './components/SearchBar';
import ResultsList from './components/ResultsList';
import AdminIndexer from './components/AdminIndexer'; 
import './App.css';

const API_BASE_URL = "https://searchengine-fbgxh3fed2ddbnag.centralindia-01.azurewebsites.net" || 'http://localhost:3001';

function App() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTime, setSearchTime] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false); // Toggle Admin Indexer panel

  const RESULTS_PER_PAGE = 10;

  // Perform search and handle pagination
  const handleSearch = async (query, page = 1) => {
    if (!query) return;

    if (page === 1) {
      setLoading(true);
      setSearchQuery(query);
      setError(null);
      setCurrentPage(1);
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}&page=${page}&limit=${RESULTS_PER_PAGE}`
      );
      
      const data = await response.json();

      if (!response.ok || data.error) {
        console.error('API Error during search:', data.message || 'Unknown API error');
        throw new Error(data.message || 'Search failed due to a server issue.');
      }

      // Merge new results for pagination
      setResults(prevResults => page === 1 ? data.results : [...prevResults, ...data.results]);
      setSearchTime(data.time);
      setTotalResults(data.totalResults);
      setHasMore(data.hasMore);
      setCurrentPage(page);

      console.log(`[Frontend] Search successful. Total results received: ${data.totalResults}`);

    } catch (err) {
      setError(err.message);
      setResults([]);
      setTotalResults(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  // Load next page of results
  const handleLoadMore = () => {
    handleSearch(searchQuery, currentPage + 1);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="container">
          <h1 className="app-title">LexiFast</h1>
          <p className="app-subtitle">Search through thousands of academic papers in a wink</p>

          {/* Toggle Admin Indexer panel */}
          <button 
            className="admin-toggle-button"
            onClick={() => setShowAdmin(prev => !prev)}
          >
            {showAdmin ? 'Hide Indexer' : 'Show Admin Indexer'}
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          {/* Admin Indexer panel */}
          {showAdmin && <AdminIndexer />}

          {/* Search input with autocomplete */}
          <SearchBar 
            onSearch={handleSearch}
            apiBaseUrl={API_BASE_URL}
          />

          {/* Error display */}
          {error && (
            <div className="error-message">
              <p>{error}</p>
            </div>
          )}

          {/* Initial loading spinner */}
          {loading && currentPage === 1 && (
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Searching...</p>
            </div>
          )}

          {/* Search info summary */}
          {!loading && results.length > 0 && (
            <div className="search-info">
              <p>
                Found <strong>{totalResults}</strong> result{totalResults !== 1 ? 's' : ''} 
                {searchTime > 0 && ` in ${searchTime}ms`}
              </p>
            </div>
          )}

          {/* Results list with load more */}
          {results.length > 0 && (
            <ResultsList 
              results={results}
              onLoadMore={handleLoadMore}
              hasMore={hasMore}
              loading={loading}
            />
          )}

          {/* No results feedback */}
          {!loading && searchQuery && results.length === 0 && !error && (
            <div className="no-results">
              <p>No results found for "<strong>{searchQuery}</strong>"</p>
              <p className="no-results-hint">Try using different keywords or check your spelling</p>
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <div className="container">
          <p>Powered by Trie-based autocomplete and inverted index search</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
