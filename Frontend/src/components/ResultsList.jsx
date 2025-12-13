import ResultItem from './ResultItem';
import './ResultsList.css';

// FIX: Set a default value for 'results' to an empty array []
function ResultsList({ results = [], onLoadMore, hasMore, loading }) {
  return (
    <div className="results-list">
      {results.map((result, index) => (
        <ResultItem key={`${result.docId}-${index}`} result={result} />
      ))}

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