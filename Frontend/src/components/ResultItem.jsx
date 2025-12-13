import './ResultItem.css';

// Displays a single search result item
// Props:
// - result: object returned by the search API, containing scoring info and metadata
function ResultItem({ result }) {
  const { 
    docId, 
    score, 
    wordCount, 
    proximityBonus, 
    title,      // Real document title
    authors,    // Authors from Doc Store
    categories  // Categories from Doc Store
  } = result;

  // Round relevance score for display
  const relevanceScore = Math.round(score * 10) / 10;

  // Placeholder snippet: currently using categories; can be replaced with abstract later
  const snippetPlaceholder = `Categories: ${categories || 'N/A'}`;

  return (
    <article className="result-item">
      <div className="result-header">
        <h3 className="result-title">{title}</h3> 
        <span className="result-score" title={`Relevance Score: ${relevanceScore}`}>
          Score: {relevanceScore}
        </span>
      </div>
      
      {/* Authors info */}
      <p className="result-authors">
        <strong>Authors:</strong> {authors || 'Unknown'}
      </p>

      {/* Snippet placeholder */}
      <p className="result-snippet">{snippetPlaceholder}</p>
      
      <div className="result-meta">
        <span className="result-doc-id">Doc ID: {docId}</span>
        <span className="result-stats">
          {wordCount} term{wordCount !== 1 ? 's' : ''} matched
          {proximityBonus > 0 && ` • +${Math.round(proximityBonus * 10) / 10} proximity`}
        </span>
      </div>
    </article>
  );
}

export default ResultItem;
