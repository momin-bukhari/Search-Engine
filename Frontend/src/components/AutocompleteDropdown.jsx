import './AutocompleteDropdown.css';

/**
 * AutocompleteDropdown Component
 * Displays a list of suggestions for autocomplete.
 * 
 * Props:
 * - suggestions: Array of suggested words
 * - onSelect: Callback when a suggestion is clicked
 * - query: Current user input to highlight matching substring
 */
function AutocompleteDropdown({ suggestions, onSelect, query }) {

  // Highlights the part of a suggestion that matches the query
  const highlightMatch = (text, query) => {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return <span>{text}</span>;

    const before = text.substring(0, index);
    const match = text.substring(index, index + query.length);
    const after = text.substring(index + query.length);

    return (
      <span>
        {before}
        <strong className="highlight">{match}</strong>
        {after}
      </span>
    );
  };

  return (
    <div className="autocomplete-dropdown">
      <ul className="autocomplete-list">
        {suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion}-${index}`} // Unique key for each suggestion
            className="autocomplete-item"
            onClick={() => onSelect(suggestion)}
          >
            {/* Icon displayed next to each suggestion */}
            <svg 
              className="suggestion-icon" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <span className="suggestion-text">
              {highlightMatch(suggestion, query)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AutocompleteDropdown;
