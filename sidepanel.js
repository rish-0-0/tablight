// TabLight Sidepanel Script
import { getSetting, removeSetting } from './db.js';

// State management
let currentTab = 'search';
let results = { tabs: [], bookmarks: [], quickAccess: [], recentlyAccessed: [], recentlyClosed: [] };
let selectedIndex = 0;
let currentQuery = '';
let autocompleteText = '';
let searchTimeout = null;

// Default favicon fallback
const DEFAULT_FAVICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAANklEQVRYR+3VQQ0AAAgDMPr/0xyHM1URuHR32TlnBAgQIECAAAECBAgQIECAAAECBAh8ErgAvg4BIf3qvGQAAAAASUVORK5CYII=';

// DOM elements
let searchInput;
let autocompleteEl;
let resultsContainer;

document.addEventListener('DOMContentLoaded', async () => {
  // Get DOM elements
  searchInput = document.getElementById('search-input');
  autocompleteEl = document.getElementById('search-autocomplete');
  resultsContainer = document.getElementById('results-container');

  // Initialize keyboard shortcuts display (Settings tab)
  await initializeShortcuts();

  // Initialize tab switching
  initializeTabSwitching();

  // Initialize search functionality
  initializeSearch();

  // Read initial tab from storage and switch to it
  await initializeActiveTab();
});

// Initialize the active tab from storage
async function initializeActiveTab() {
  try {
    const sidePanelTab = await getSetting('sidePanelTab');
    const initialTab = sidePanelTab || 'search';
    // Clear the stored value after reading
    await removeSetting('sidePanelTab');
    switchTab(initialTab);
  } catch (error) {
    // Default to search tab on error
    switchTab('search');
  }
}

// Initialize tab switching
function initializeTabSwitching() {
  const tabButtons = document.querySelectorAll('.tab-button');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      switchTab(tabName);
    });
  });
}

// Switch to a specific tab
function switchTab(tabName) {
  currentTab = tabName;

  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });

  // Focus search input when switching to search tab
  if (tabName === 'search' && searchInput) {
    searchInput.focus();
    // Load recent tabs if no query
    if (!currentQuery) {
      performSearch('');
    }
  }
}

// Initialize search functionality
function initializeSearch() {
  // Input event for search
  searchInput.addEventListener('input', (e) => {
    currentQuery = e.target.value;

    // Debounce search
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    searchTimeout = setTimeout(() => {
      performSearch(currentQuery);
    }, 100);
  });

  // Keyboard navigation
  searchInput.addEventListener('keydown', handleKeydown);
}

// Handle keyboard events
function handleKeydown(e) {
  const allResults = getAllResults();

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (allResults.length > 0) {
      selectedIndex = Math.min(selectedIndex + 1, allResults.length - 1);
      renderResults();
      scrollToSelected();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (allResults.length > 0) {
      selectedIndex = Math.max(selectedIndex - 1, 0);
      renderResults();
      scrollToSelected();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (allResults.length > 0) {
      selectItem(selectedIndex);
    }
  } else if (e.key === 'Tab') {
    // Accept autocomplete
    if (autocompleteText && autocompleteText !== currentQuery) {
      e.preventDefault();
      searchInput.value = autocompleteText;
      currentQuery = autocompleteText;
      performSearch(currentQuery);
    }
  } else if (e.key === 'Escape') {
    // Clear search
    e.preventDefault();
    searchInput.value = '';
    currentQuery = '';
    autocompleteText = '';
    autocompleteEl.innerHTML = '';
    performSearch('');
  }
}

// Perform search
function performSearch(query) {
  chrome.runtime.sendMessage({
    action: 'search-tabs',
    query: query
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Search error:', chrome.runtime.lastError);
      return;
    }
    if (response) {
      results = {
        tabs: response.tabs || [],
        bookmarks: response.bookmarks || [],
        quickAccess: response.quickAccess || [],
        recentlyAccessed: response.recentlyAccessed || [],
        recentlyClosed: response.recentlyClosed || []
      };
      selectedIndex = 0;
      updateAutocomplete();
      renderResults();
    }
  });
}

// Update autocomplete text
function updateAutocomplete() {
  const allResults = getAllResults();

  if (currentQuery && allResults.length > 0) {
    const bestMatch = allResults[0];
    const title = bestMatch.title || '';
    const lowerTitle = title.toLowerCase();
    const lowerQuery = currentQuery.toLowerCase();

    if (lowerTitle.startsWith(lowerQuery)) {
      autocompleteText = currentQuery + title.slice(currentQuery.length);
      // Display: invisible typed text + visible completion
      const typedPart = `<span style="opacity: 0;">${escapeHtml(currentQuery)}</span>`;
      const completionPart = `<span>${escapeHtml(title.slice(currentQuery.length))}</span>`;
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

// Render results
function renderResults() {
  resultsContainer.innerHTML = '';

  const allResults = getAllResults();

  if (allResults.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'results-empty';
    empty.textContent = currentQuery ? 'No matching tabs found' : 'No recent tabs';
    resultsContainer.appendChild(empty);
    return;
  }

  let currentIndex = 0;

  // Open tabs section
  if (results.tabs.length > 0) {
    const label = document.createElement('div');
    label.className = 'results-section-label';
    label.textContent = 'Open Tabs';
    resultsContainer.appendChild(label);

    results.tabs.forEach((tab) => {
      resultsContainer.appendChild(createResultItem(tab, currentIndex++, 'tab'));
    });
  }

  // Bookmarks section
  if (results.bookmarks.length > 0) {
    const label = document.createElement('div');
    label.className = 'results-section-label';
    label.textContent = 'Bookmarks';
    resultsContainer.appendChild(label);

    results.bookmarks.forEach((bookmark) => {
      resultsContainer.appendChild(createResultItem(bookmark, currentIndex++, 'bookmark'));
    });
  }

  // Chrome Quick Access section
  if (results.quickAccess.length > 0) {
    const label = document.createElement('div');
    label.className = 'results-section-label';
    label.textContent = 'Chrome';
    resultsContainer.appendChild(label);

    results.quickAccess.forEach((page) => {
      resultsContainer.appendChild(createResultItem(page, currentIndex++, 'quickAccess'));
    });
  }

  // Recently Accessed section
  if (results.recentlyAccessed.length > 0) {
    const label = document.createElement('div');
    label.className = 'results-section-label';
    label.textContent = 'Recently Accessed';
    resultsContainer.appendChild(label);

    results.recentlyAccessed.forEach((tab) => {
      resultsContainer.appendChild(createResultItem(tab, currentIndex++, 'recentlyAccessed'));
    });
  }

  // Recently closed section
  if (results.recentlyClosed.length > 0) {
    const label = document.createElement('div');
    label.className = 'results-section-label';
    label.textContent = 'Recently Closed';
    resultsContainer.appendChild(label);

    results.recentlyClosed.forEach((tab) => {
      resultsContainer.appendChild(createResultItem(tab, currentIndex++, 'recentlyClosed'));
    });
  }
}

// Create a result item element
function createResultItem(item, index, type) {
  const isSelected = index === selectedIndex;

  const itemEl = document.createElement('div');
  itemEl.className = 'result-item' + (isSelected ? ' selected' : '');
  itemEl.dataset.index = index;
  itemEl.dataset.type = type;

  // Favicon
  const favicon = document.createElement('img');
  favicon.className = 'result-favicon';
  favicon.src = item.favIconUrl || DEFAULT_FAVICON;
  favicon.alt = '';
  favicon.onerror = function() {
    this.src = DEFAULT_FAVICON;
  };
  itemEl.appendChild(favicon);

  // Content
  const content = document.createElement('div');
  content.className = 'result-content';

  const title = document.createElement('div');
  title.className = 'result-title';
  title.innerHTML = highlightMatch(item.title || 'Untitled', currentQuery);
  content.appendChild(title);

  const url = document.createElement('div');
  url.className = 'result-url';
  url.textContent = truncateUrl(item.url || '');
  content.appendChild(url);

  itemEl.appendChild(content);

  // Badge based on type
  if (type === 'recentlyClosed') {
    const badge = document.createElement('span');
    badge.className = 'result-badge';
    badge.textContent = 'Closed';
    itemEl.appendChild(badge);
  } else if (type === 'bookmark') {
    const badge = document.createElement('span');
    badge.className = 'result-badge';
    badge.textContent = 'Bookmark';
    itemEl.appendChild(badge);
  } else if (type === 'quickAccess') {
    const badge = document.createElement('span');
    badge.className = 'result-badge';
    badge.textContent = 'Chrome';
    itemEl.appendChild(badge);
  }

  // Shortcut indicator for selected item
  if (isSelected) {
    const shortcut = document.createElement('span');
    shortcut.className = 'result-shortcut';
    shortcut.textContent = '\u21B5'; // ↵
    itemEl.appendChild(shortcut);
  }

  // Click handler
  itemEl.addEventListener('click', () => selectItem(index));

  return itemEl;
}

// Get all results as a flat array
function getAllResults() {
  return [
    ...results.tabs,
    ...results.bookmarks,
    ...results.quickAccess,
    ...results.recentlyAccessed,
    ...results.recentlyClosed
  ];
}

// Get item type by index
function getItemTypeByIndex(index) {
  let offset = 0;

  if (index < offset + results.tabs.length) return 'tab';
  offset += results.tabs.length;

  if (index < offset + results.bookmarks.length) return 'bookmark';
  offset += results.bookmarks.length;

  if (index < offset + results.quickAccess.length) return 'quickAccess';
  offset += results.quickAccess.length;

  if (index < offset + results.recentlyAccessed.length) return 'recentlyAccessed';
  offset += results.recentlyAccessed.length;

  if (index < offset + results.recentlyClosed.length) return 'recentlyClosed';

  return 'tab';
}

// Select an item
function selectItem(index) {
  const allResults = getAllResults();
  const item = allResults[index];
  const type = getItemTypeByIndex(index);

  if (!item) return;

  if (type === 'recentlyClosed' || item.isRecentlyClosed) {
    // Restore recently closed tab
    chrome.runtime.sendMessage({
      action: 'restore-session',
      sessionId: item.sessionId
    });
  } else if (type === 'bookmark' || item.isBookmark) {
    // Open bookmark in new tab
    chrome.runtime.sendMessage({
      action: 'open-bookmark',
      bookmarkId: item.id,
      url: item.url
    });
  } else if (type === 'quickAccess' || item.isQuickAccess) {
    // Open Chrome quick access page
    chrome.runtime.sendMessage({
      action: 'open-quick-access',
      url: item.url
    });
  } else {
    // Switch to open tab (tab or recentlyAccessed)
    chrome.runtime.sendMessage({
      action: 'switch-to-tab',
      tabId: item.id,
      windowId: item.windowId
    });
  }

  // Clear search after selection (panel stays open)
  searchInput.value = '';
  currentQuery = '';
  autocompleteText = '';
  autocompleteEl.innerHTML = '';
  performSearch('');
}

// Scroll to keep selected item visible
function scrollToSelected() {
  const selectedItem = resultsContainer.querySelector('.result-item.selected');
  if (selectedItem) {
    selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
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

  return `${before}<span class="highlight">${match}</span>${after}`;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Truncate URL for display
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

// Initialize keyboard shortcuts display (Settings tab)
async function initializeShortcuts() {
  const platformInfo = await chrome.runtime.getPlatformInfo();
  const isMac = platformInfo.os === 'mac';

  function createKbd(text) {
    const kbd = document.createElement('kbd');
    kbd.textContent = text;
    return kbd;
  }

  function createSeparator() {
    const span = document.createElement('span');
    span.className = 'separator';
    span.textContent = '+';
    return span;
  }

  // Open TabLight shortcut
  const openShortcutEl = document.getElementById('open-shortcut');
  if (openShortcutEl) {
    if (isMac) {
      openShortcutEl.appendChild(createKbd('\u2318'));
      openShortcutEl.appendChild(createSeparator());
      openShortcutEl.appendChild(createKbd('Shift'));
      openShortcutEl.appendChild(createSeparator());
      openShortcutEl.appendChild(createKbd('K'));
    } else {
      openShortcutEl.appendChild(createKbd('Ctrl'));
      openShortcutEl.appendChild(createSeparator());
      openShortcutEl.appendChild(createKbd('Shift'));
      openShortcutEl.appendChild(createSeparator());
      openShortcutEl.appendChild(createKbd('K'));
    }
  }

  // MRU Tab shortcut
  const mruShortcutEl = document.getElementById('mru-shortcut');
  if (mruShortcutEl) {
    mruShortcutEl.appendChild(createKbd('Alt'));
    mruShortcutEl.appendChild(createSeparator());
    mruShortcutEl.appendChild(createKbd('Q'));
  }
}
