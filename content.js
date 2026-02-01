// TabLight Content Script - Using Shadow DOM for style isolation
(function() {
  // Prevent multiple initializations
  if (window.__tablightInitialized) return;
  window.__tablightInitialized = true;

  let hostElement = null;
  let shadowRoot = null;
  let isVisible = false;
  let results = { tabs: [], recentlyClosed: [] };
  let selectedIndex = 0;
  let currentQuery = '';
  let autocompleteText = '';
  let searchTimeout = null;

  // Base64 encoded default favicon (simple gray square)
  const DEFAULT_FAVICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAANklEQVRYR+3VQQ0AAAgDMPr/0xyHM1URuHR32TlnBAgQIECAAAECBAgQIECAAAECBAh8ErgAvg4BIf3qvGQAAAAASUVORK5CYII=';

  const styles = `
    :host {
      all: initial;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    .tablight-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2147483647;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding-top: 15vh;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.15s ease, visibility 0.15s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    }

    .tablight-overlay.visible {
      opacity: 1;
      visibility: visible;
    }

    .tablight-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .tablight-container {
      position: relative;
      width: 680px;
      max-width: 90vw;
      background: rgba(30, 30, 30, 0.85);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border-radius: 16px;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.1),
        0 25px 50px -12px rgba(0, 0, 0, 0.5),
        0 12px 24px -8px rgba(0, 0, 0, 0.4),
        0 4px 8px -2px rgba(0, 0, 0, 0.3);
      overflow: hidden;
      transform: translateY(-10px);
      transition: transform 0.15s ease;
    }

    .tablight-overlay.visible .tablight-container {
      transform: translateY(0);
    }

    .tablight-search-wrapper {
      display: flex;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      position: relative;
    }

    .tablight-search-icon {
      width: 22px;
      height: 22px;
      color: rgba(255, 255, 255, 0.5);
      flex-shrink: 0;
      margin-right: 18px;
    }

    .tablight-input-container {
      flex: 1;
      position: relative;
    }

    .tablight-input {
      width: 100%;
      background: transparent !important;
      border: none;
      outline: none;
      font-size: 20px;
      font-weight: 300;
      color: #ffffff;
      caret-color: #007AFF;
      letter-spacing: -0.02em;
      position: relative;
      z-index: 2;
    }

    .tablight-input::placeholder {
      color: rgba(255, 255, 255, 0.35);
    }

    .tablight-autocomplete {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      font-size: 20px;
      font-weight: 300;
      color: rgba(255, 255, 255, 0.35);
      letter-spacing: -0.02em;
      pointer-events: none;
      white-space: pre;
      overflow: hidden;
      z-index: 1;
      line-height: normal;
    }

    .tablight-results {
      max-height: 450px;
      overflow-y: auto;
      padding: 12px 8px;
    }

    .tablight-results::-webkit-scrollbar {
      width: 8px;
    }

    .tablight-results::-webkit-scrollbar-track {
      background: transparent;
    }

    .tablight-results::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
    }

    .tablight-section-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: rgba(255, 255, 255, 0.4);
      padding: 8px 18px 6px;
      margin-top: 8px;
    }

    .tablight-section-label:first-child {
      margin-top: 0;
    }

    .tablight-result-item {
      display: flex;
      align-items: center;
      padding: 14px 18px;
      margin-bottom: 4px;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.1s ease;
    }

    .tablight-result-item:last-child {
      margin-bottom: 0;
    }

    .tablight-result-item:hover {
      background: rgba(255, 255, 255, 0.06);
    }

    .tablight-result-item.selected {
      background: rgba(0, 122, 255, 0.35);
    }

    .tablight-favicon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      object-fit: cover;
      flex-shrink: 0;
      margin-right: 18px;
      background: rgba(255, 255, 255, 0.1);
    }

    .tablight-result-content {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }

    .tablight-result-title {
      font-size: 15px;
      font-weight: 500;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }

    .tablight-result-url {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.45);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tablight-result-badge {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: rgba(255, 255, 255, 0.5);
      background: rgba(255, 255, 255, 0.1);
      padding: 3px 8px;
      border-radius: 4px;
      margin-left: 12px;
      flex-shrink: 0;
    }

    .tablight-shortcut {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.5);
      background: rgba(255, 255, 255, 0.1);
      padding: 4px 10px;
      border-radius: 6px;
      margin-left: 12px;
      flex-shrink: 0;
    }

    .tablight-empty {
      padding: 24px 20px;
      text-align: center;
      color: rgba(255, 255, 255, 0.4);
      font-size: 14px;
    }

    .tablight-highlight {
      background: rgba(0, 122, 255, 0.3);
      border-radius: 2px;
      padding: 0 2px;
    }
  `;

  // Extract and send meta tags on page load
  function extractAndSendMetaTags() {
    const meta = {
      description: '',
      keywords: ''
    };

    const descriptionTag = document.querySelector('meta[name="description"]') ||
                          document.querySelector('meta[property="og:description"]');
    if (descriptionTag) {
      meta.description = descriptionTag.getAttribute('content') || '';
    }

    const keywordsTag = document.querySelector('meta[name="keywords"]');
    if (keywordsTag) {
      meta.keywords = keywordsTag.getAttribute('content') || '';
    }

    safeSendMessage({ action: 'meta-tags-extracted', meta });
  }

  // Create the overlay UI with Shadow DOM
  function createOverlay() {
    if (hostElement) return;

    hostElement = document.createElement('div');
    hostElement.id = 'tablight-host';
    document.body.appendChild(hostElement);

    shadowRoot = hostElement.attachShadow({ mode: 'closed' });

    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    shadowRoot.appendChild(styleEl);

    const overlay = document.createElement('div');
    overlay.className = 'tablight-overlay';
    overlay.innerHTML = `
      <div class="tablight-backdrop"></div>
      <div class="tablight-container">
        <div class="tablight-search-wrapper">
          <svg class="tablight-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="M21 21l-4.35-4.35"></path>
          </svg>
          <div class="tablight-input-container">
            <div class="tablight-autocomplete"></div>
            <input
              type="text"
              class="tablight-input"
              placeholder="Search tabs..."
              autocomplete="off"
              spellcheck="false"
            />
          </div>
        </div>
        <div class="tablight-results"></div>
      </div>
    `;
    shadowRoot.appendChild(overlay);

    const backdrop = shadowRoot.querySelector('.tablight-backdrop');

    // Only backdrop click handler - all keyboard events handled at window level
    backdrop.addEventListener('click', hideOverlay);
  }

  // Check if extension context is still valid
  function isExtensionValid() {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch {
      return false;
    }
  }

  // Safe message sender that handles extension reload gracefully
  function safeSendMessage(message, callback) {
    if (!isExtensionValid()) {
      // Extension was reloaded - clean up and ignore
      hideOverlay();
      return;
    }

    try {
      chrome.runtime.sendMessage(message, (response) => {
        // Check for errors silently
        if (chrome.runtime.lastError) {
          // Extension context invalidated - just hide overlay
          hideOverlay();
          return;
        }
        if (callback) callback(response);
      });
    } catch {
      // Extension context invalidated
      hideOverlay();
    }
  }

  // Perform search
  function performSearch(query) {
    safeSendMessage({
      action: 'search-tabs',
      query: query
    }, (response) => {
      if (response) {
        results = {
          tabs: response.tabs || [],
          recentlyClosed: response.recentlyClosed || []
        };
        selectedIndex = 0;
        updateAutocomplete();
        renderResults();
      }
    });
  }

  // Update inline autocomplete text
  function updateAutocomplete() {
    const autocompleteEl = shadowRoot.querySelector('.tablight-autocomplete');
    if (!autocompleteEl) return;

    const allResults = [...results.tabs, ...results.recentlyClosed];

    if (currentQuery && allResults.length > 0) {
      const bestMatch = allResults[0];
      const title = bestMatch.title || '';
      const lowerTitle = title.toLowerCase();
      const lowerQuery = currentQuery.toLowerCase();

      if (lowerTitle.startsWith(lowerQuery)) {
        // Set autocomplete text (for Tab completion)
        autocompleteText = currentQuery + title.slice(currentQuery.length);

        // Display: invisible typed text + visible completion
        // Use HTML to make typed part invisible
        const typedPart = `<span style="opacity: 0;">${escapeHtml(currentQuery)}</span>`;
        const completionPart = `<span style="color: rgba(255, 255, 255, 0.35);">${escapeHtml(title.slice(currentQuery.length))}</span>`;
        autocompleteEl.innerHTML = typedPart + completionPart;
      } else {
        autocompleteEl.innerHTML = '';
        autocompleteText = '';
      }
    } else {
      autocompleteEl.innerHTML = '';
      autocompleteText = '';
    }
  }

  // Render the results list using DOM manipulation (not innerHTML for items)
  function renderResults() {
    const resultsContainer = shadowRoot.querySelector('.tablight-results');
    if (!resultsContainer) return;

    // Clear container
    resultsContainer.innerHTML = '';

    const allResults = getAllResults();

    if (allResults.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tablight-empty';
      empty.textContent = currentQuery ? 'No matching tabs found' : 'No recent tabs';
      resultsContainer.appendChild(empty);
      return;
    }

    // Open tabs section
    if (results.tabs.length > 0) {
      const label = document.createElement('div');
      label.className = 'tablight-section-label';
      label.textContent = 'Open Tabs';
      resultsContainer.appendChild(label);

      results.tabs.forEach((tab, index) => {
        resultsContainer.appendChild(createResultItem(tab, index, false));
      });
    }

    // Recently closed section
    if (results.recentlyClosed.length > 0) {
      const label = document.createElement('div');
      label.className = 'tablight-section-label';
      label.textContent = 'Recently Closed';
      resultsContainer.appendChild(label);

      results.recentlyClosed.forEach((tab, index) => {
        resultsContainer.appendChild(createResultItem(tab, results.tabs.length + index, true));
      });
    }
  }

  // Create a result item element
  function createResultItem(tab, index, isRecentlyClosed) {
    const isSelected = index === selectedIndex;

    const item = document.createElement('div');
    item.className = 'tablight-result-item' + (isSelected ? ' selected' : '');
    item.dataset.index = index;

    // Favicon
    const favicon = document.createElement('img');
    favicon.className = 'tablight-favicon';
    favicon.src = tab.favIconUrl || DEFAULT_FAVICON;
    favicon.alt = '';
    favicon.onerror = function() {
      this.src = DEFAULT_FAVICON;
    };
    item.appendChild(favicon);

    // Content
    const content = document.createElement('div');
    content.className = 'tablight-result-content';

    const title = document.createElement('div');
    title.className = 'tablight-result-title';
    title.innerHTML = highlightMatch(tab.title || 'Untitled', currentQuery);
    content.appendChild(title);

    const url = document.createElement('div');
    url.className = 'tablight-result-url';
    url.textContent = truncateUrl(tab.url || '');
    content.appendChild(url);

    item.appendChild(content);

    // Badge for recently closed
    if (isRecentlyClosed) {
      const badge = document.createElement('span');
      badge.className = 'tablight-result-badge';
      badge.textContent = 'Closed';
      item.appendChild(badge);
    }

    // Shortcut indicator for selected item
    if (isSelected) {
      const shortcut = document.createElement('span');
      shortcut.className = 'tablight-shortcut';
      shortcut.textContent = '↵';
      item.appendChild(shortcut);
    }

    // Click handler
    item.addEventListener('click', () => selectItem(index));

    return item;
  }

  // Get all results as a flat array
  function getAllResults() {
    return [...results.tabs, ...results.recentlyClosed];
  }

  // Highlight matching text
  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return escapeHtml(text);

    const before = escapeHtml(text.slice(0, index));
    const match = escapeHtml(text.slice(index, index + query.length));
    const after = escapeHtml(text.slice(index + query.length));

    return `${before}<span class="tablight-highlight">${match}</span>${after}`;
  }

  // Select an item
  function selectItem(index) {
    const allResults = getAllResults();
    const item = allResults[index];

    if (!item) return;

    if (item.isRecentlyClosed) {
      safeSendMessage({
        action: 'restore-session',
        sessionId: item.sessionId
      }, () => {
        hideOverlay();
      });
    } else {
      safeSendMessage({
        action: 'switch-to-tab',
        tabId: item.id,
        windowId: item.windowId
      }, () => {
        hideOverlay();
      });
    }
  }

  // Scroll to keep selected item visible
  function scrollToSelected() {
    const resultsContainer = shadowRoot.querySelector('.tablight-results');
    const selectedItem = resultsContainer.querySelector('.tablight-result-item.selected');

    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // Show the overlay
  function showOverlay() {
    createOverlay();

    // Blur any currently focused element on the page
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }

    // Reset all state
    selectedIndex = 0;
    currentQuery = '';
    autocompleteText = '';
    results = { tabs: [], recentlyClosed: [] };

    // Clear any pending search
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }

    const overlay = shadowRoot.querySelector('.tablight-overlay');
    const input = shadowRoot.querySelector('.tablight-input');
    const autocompleteEl = shadowRoot.querySelector('.tablight-autocomplete');

    // Reset input - ensure it's enabled and clean
    input.value = '';
    input.disabled = false;
    input.readOnly = false;
    autocompleteEl.innerHTML = '';

    // Show overlay
    overlay.classList.add('visible');
    isVisible = true;

    // Load recent tabs
    performSearch('');

    // Focus input immediately and again after animation frame
    input.focus();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        input.focus();
      });
    });
  }

  // Hide the overlay
  function hideOverlay() {
    if (!shadowRoot) return;

    // Clear any pending search
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }

    const overlay = shadowRoot.querySelector('.tablight-overlay');
    const input = shadowRoot.querySelector('.tablight-input');
    const autocompleteEl = shadowRoot.querySelector('.tablight-autocomplete');

    if (input) {
      input.blur();
      input.value = '';
    }

    if (autocompleteEl) {
      autocompleteEl.innerHTML = '';
    }

    if (overlay) {
      overlay.classList.remove('visible');
    }

    // Reset state
    isVisible = false;
    currentQuery = '';
    autocompleteText = '';
    selectedIndex = 0;
  }

  // Toggle overlay visibility
  function toggleOverlay() {
    // Use a small delay to prevent rapid toggling issues
    if (isVisible) {
      hideOverlay();
    } else {
      showOverlay();
    }
  }

  // Single handler for ALL keyboard events when overlay is active
  function handleAllKeyboardEvents(e) {
    // Overlay inactive - do nothing, let page handle events
    if (!isVisible) return;

    // Overlay active - capture EVERYTHING
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();

    const input = shadowRoot?.querySelector('.tablight-input');
    if (!input) return;

    // Escape - close overlay
    if (e.key === 'Escape') {
      hideOverlay();
      return;
    }

    // Arrow Down - move selection down
    if (e.key === 'ArrowDown') {
      const allResults = getAllResults();
      if (allResults.length > 0) {
        selectedIndex = Math.min(selectedIndex + 1, allResults.length - 1);
        renderResults();
        scrollToSelected();
      }
      return;
    }

    // Arrow Up - move selection up
    if (e.key === 'ArrowUp') {
      const allResults = getAllResults();
      if (allResults.length > 0) {
        selectedIndex = Math.max(selectedIndex - 1, 0);
        renderResults();
        scrollToSelected();
      }
      return;
    }

    // Enter - select current item
    if (e.key === 'Enter') {
      const allResults = getAllResults();
      if (allResults.length > 0) {
        selectItem(selectedIndex);
      }
      return;
    }

    // Tab - accept autocomplete
    if (e.key === 'Tab') {
      if (autocompleteText && autocompleteText !== currentQuery) {
        input.value = autocompleteText;
        currentQuery = autocompleteText;
        performSearch(currentQuery);
      }
      return;
    }

    // Backspace - delete character
    if (e.key === 'Backspace') {
      const currentValue = input.value;
      const selStart = input.selectionStart || currentValue.length;
      const selEnd = input.selectionEnd || currentValue.length;
      if (selStart === selEnd && selStart > 0) {
        input.value = currentValue.slice(0, selStart - 1) + currentValue.slice(selEnd);
        input.selectionStart = input.selectionEnd = selStart - 1;
      } else if (selStart !== selEnd) {
        input.value = currentValue.slice(0, selStart) + currentValue.slice(selEnd);
        input.selectionStart = input.selectionEnd = selStart;
      }
      currentQuery = input.value;
      performSearch(currentQuery);
      return;
    }

    // Delete key
    if (e.key === 'Delete') {
      const currentValue = input.value;
      const selStart = input.selectionStart || 0;
      const selEnd = input.selectionEnd || 0;
      if (selStart === selEnd && selStart < currentValue.length) {
        input.value = currentValue.slice(0, selStart) + currentValue.slice(selStart + 1);
        input.selectionStart = input.selectionEnd = selStart;
      } else if (selStart !== selEnd) {
        input.value = currentValue.slice(0, selStart) + currentValue.slice(selEnd);
        input.selectionStart = input.selectionEnd = selStart;
      }
      currentQuery = input.value;
      performSearch(currentQuery);
      return;
    }

    // Arrow Left/Right - move cursor (allow in input)
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Let these work naturally for cursor movement in input
      // We need to manually handle since we prevented default
      const currentValue = input.value;
      let selStart = input.selectionStart || 0;
      if (e.key === 'ArrowLeft' && selStart > 0) {
        input.selectionStart = input.selectionEnd = selStart - 1;
      } else if (e.key === 'ArrowRight' && selStart < currentValue.length) {
        input.selectionStart = input.selectionEnd = selStart + 1;
      }
      return;
    }

    // Printable characters - type into input
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const currentValue = input.value;
      const selStart = input.selectionStart || currentValue.length;
      const selEnd = input.selectionEnd || currentValue.length;
      input.value = currentValue.slice(0, selStart) + e.key + currentValue.slice(selEnd);
      input.selectionStart = input.selectionEnd = selStart + 1;
      currentQuery = input.value;
      performSearch(currentQuery);
      return;
    }
  }

  // Prevent focus from going to page elements while overlay is visible
  function preventPageFocus(e) {
    if (!isVisible) return;

    // Check if the focus target is our input (inside shadow DOM)
    const input = shadowRoot?.querySelector('.tablight-input');
    if (!input) return;

    // If focus is going to our shadow DOM, allow it
    const path = e.composedPath?.() || [];
    if (path.includes(hostElement) || path.some(el => el === shadowRoot)) {
      return; // Allow focus within our UI
    }

    // Focus is going somewhere on the page - redirect to our input
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    input.focus();
  }

  // Prevent mouse clicks from reaching page when overlay is active
  function preventPageClicks(e) {
    if (!isVisible) return;

    // Allow clicks within our shadow DOM
    const path = e.composedPath?.() || [];
    if (path.includes(hostElement) || path.some(el => el === shadowRoot)) {
      return;
    }

    // Block clicks on the page
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
  }

  // Add event listeners at window level (highest priority) in capture phase
  // Only keydown matters - keyup/keypress don't need character handling
  window.addEventListener('keydown', handleAllKeyboardEvents, true);

  // Block keyup and keypress from reaching page (but don't process them)
  function blockEvent(e) {
    if (!isVisible) return;
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
  }
  window.addEventListener('keyup', blockEvent, true);
  window.addEventListener('keypress', blockEvent, true);

  // Prevent focus from going to page elements
  window.addEventListener('focusin', preventPageFocus, true);

  // Prevent clicks from reaching page elements
  window.addEventListener('mousedown', preventPageClicks, true);
  window.addEventListener('click', preventPageClicks, true);

  // Utility: escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Utility: truncate URL
  function truncateUrl(url) {
    try {
      const urlObj = new URL(url);
      let path = urlObj.pathname;
      if (path.length > 30) {
        path = path.slice(0, 30) + '...';
      }
      return urlObj.hostname + (path !== '/' ? path : '');
    } catch {
      return url;
    }
  }

  // Listen for messages from background script
  // Listen for messages from background script (wrapped in try-catch for extension reload)
  try {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      try {
        if (request.action === 'toggle-overlay') {
          toggleOverlay();
          sendResponse({ success: true });
        } else if (request.action === 'get-meta-tags') {
          const meta = {
            description: '',
            keywords: ''
          };

          const descriptionTag = document.querySelector('meta[name="description"]') ||
                                document.querySelector('meta[property="og:description"]');
          if (descriptionTag) {
            meta.description = descriptionTag.getAttribute('content') || '';
          }

          const keywordsTag = document.querySelector('meta[name="keywords"]');
          if (keywordsTag) {
            meta.keywords = keywordsTag.getAttribute('content') || '';
          }

          sendResponse({ meta });
        }
      } catch {
        // Extension context invalidated, ignore
      }
      return true;
    });
  } catch {
    // Extension context invalidated
  }

  // Extract meta tags when page loads
  if (document.readyState === 'complete') {
    extractAndSendMetaTags();
  } else {
    window.addEventListener('load', extractAndSendMetaTags);
  }
})();
