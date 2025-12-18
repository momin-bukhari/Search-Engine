import { useState, useEffect, useRef } from 'react';
import AutocompleteDropdown from './AutocompleteDropdown';
import './SearchBar.css';

/**
 * SearchBar Component
 * Handles user input for search queries with live autocomplete support.
 * 
 * Props:
 * - onSearch: Function called when a search is submitted
 * - apiBaseUrl: Base URL for backend API requests (used for autocomplete)
 */
function SearchBar({ onSearch, apiBaseUrl }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const searchInputRef = useRef(null);   // Reference to the input element
  const dropdownRef = useRef(null);      // Reference to dropdown wrapper
  const debounceTimerRef = useRef(null); // Debounce timer for API calls

  // Close dropdown when clicking outside the input or dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target) &&
        !searchInputRef.current.contains(event.target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch autocomplete suggestions from the backend
  const fetchSuggestions = async (searchQuery) => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    setLoadingSuggestions(true);

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/autocomplete?q=${encodeURIComponent(searchQuery)}`
      );

      if (!response.ok) throw new Error('Autocomplete request failed');

      const data = await response.json();
      setSuggestions(data.suggestions || []);
      setShowDropdown(data.suggestions.length > 0);
    } catch (err) {
      console.error('Autocomplete error:', err);
      setSuggestions([]);
      setShowDropdown(false);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Handle input changes with 200ms debounce to reduce API calls
  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 200);
  };

  // Handle selection of an autocomplete suggestion
  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion);
    setShowDropdown(false);
    onSearch(suggestion);
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    setShowDropdown(false);
    onSearch(query);
  };

  // Show dropdown on input focus if suggestions are available
  const handleInputFocus = () => {
    if (suggestions.length > 0) setShowDropdown(true);
  };

  // Hide dropdown when Escape key is pressed
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') setShowDropdown(false);
  };

  return (
    <div className="search-bar-container">
      <form onSubmit={handleSubmit} className="search-form">
        <div className="search-input-wrapper" ref={dropdownRef}>
          <input
            ref={searchInputRef}
            type="text"
            className="search-input"
            placeholder="Search for papers (e.g., machine learning, neural networks...)"
            value={query}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />

          {/* Spinner displayed while fetching suggestions */}
          {loadingSuggestions && (
            <div className="input-loading-indicator">
              <div className="mini-spinner"></div>
            </div>
          )}

          {/* Autocomplete suggestions dropdown */}
          {showDropdown && suggestions.length > 0 && (
            <AutocompleteDropdown
              suggestions={suggestions}
              onSelect={handleSuggestionClick}
              query={query}
            />
          )}
        </div>

        <button type="submit" className="search-button">
          <svg 
            className="search-icon" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          Search
        </button>
      </form>
    </div>
  );
}

export default SearchBar;
