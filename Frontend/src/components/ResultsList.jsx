import ResultItem from './ResultItem';
import './ResultsList.css';

/**
 * ResultsList Component
 * Renders a list of search result items with optional "Load More" functionality.
 * 
 * Props:
 * - results: Array of search result objects (default: empty array)
 * - onLoadMore: Callback function to fetch the next page of results
 * - hasMore: Boolean indicating if more results are available
 * - loading: Boolean indicating if a fetch is currently in progress
 */
function ResultsList({ results = [], onLoadMore, hasMore, loading }) {
  return (
    <div className="results-list">
      {/* Render each search result */}
      {results.map((result, index) => (
        <ResultItem key={`${result.docId}-${index}`} result={result} />
      ))}

      {/* Load More button for pagination */}
      {hasMore && (
        <div className="load-more-container">
          <button 
            className="load-more-button" 
            onClick={onLoadMore}
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="button-spinner"></div>
                Loading...
              </>
            ) : (
              'Load More Results'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default ResultsList;
