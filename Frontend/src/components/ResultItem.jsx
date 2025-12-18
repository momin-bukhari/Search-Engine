import './ResultItem.css';

/**
 * ResultItem Component
 * Renders a single search result item with metadata and relevance info.
 * 
 * Props:
 * - result: Object returned by the search API containing:
 *    - docId: Unique document identifier
 *    - score: Relevance score
 *    - wordCount: Number of query terms matched
 *    - proximityBonus: Bonus for term proximity
 *    - title: Document title from Doc Store
 *    - authors: Authors from Doc Store
 *    - categories: Categories from Doc Store
 */
function ResultItem({ result }) {
  const { 
    docId, 
    score, 
    wordCount, 
    proximityBonus, 
    title, 
    authors, 
    categories 
  } = result;

  // Round relevance score to one decimal place for display
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
