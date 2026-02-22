// TabLight IndexedDB Module

const DB_NAME = 'tablight';
const DB_VERSION = 3;
const TABS_STORE = 'tabs';
const BOOKMARKS_STORE = 'bookmarks';
const RECENTLY_ACCESSED_STORE = 'recentlyAccessed';
const SETTINGS_STORE = 'settings';

let db = null;

// Initialize the database
export async function initDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      const oldVersion = event.oldVersion;

      // Create tabs store (v1)
      if (!database.objectStoreNames.contains(TABS_STORE)) {
        const store = database.createObjectStore(TABS_STORE, { keyPath: 'id' });

        // Create indexes for searching
        store.createIndex('title', 'title', { unique: false });
        store.createIndex('url', 'url', { unique: false });
        store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
      }

      // Create bookmarks store (v2)
      if (oldVersion < 2 && !database.objectStoreNames.contains(BOOKMARKS_STORE)) {
        const bookmarksStore = database.createObjectStore(BOOKMARKS_STORE, { keyPath: 'id' });
        bookmarksStore.createIndex('url', 'url', { unique: false });
        bookmarksStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
      }

      // Create recently accessed store (v2)
      if (oldVersion < 2 && !database.objectStoreNames.contains(RECENTLY_ACCESSED_STORE)) {
        const recentlyAccessedStore = database.createObjectStore(RECENTLY_ACCESSED_STORE, { keyPath: 'id' });
        recentlyAccessedStore.createIndex('accessedAt', 'accessedAt', { unique: false });
      }

      // Create settings store (v3)
      if (oldVersion < 3 && !database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
  });
}

// Add or update a tab in the index
export async function upsertTab(tabData) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([TABS_STORE], 'readwrite');
    const store = transaction.objectStore(TABS_STORE);

    const data = {
      id: tabData.id,
      windowId: tabData.windowId,
      title: tabData.title || '',
      url: tabData.url || '',
      favIconUrl: tabData.favIconUrl || '',
      metaDescription: tabData.metaDescription || '',
      metaKeywords: tabData.metaKeywords || '',
      lastAccessed: tabData.lastAccessed || Date.now(),
      // Combine all searchable text for easier searching
      searchText: [
        tabData.title || '',
        tabData.url || '',
        tabData.metaDescription || '',
        tabData.metaKeywords || ''
      ].join(' ').toLowerCase()
    };

    const request = store.put(data);
    request.onsuccess = () => resolve(data);
    request.onerror = () => reject(request.error);
  });
}

// Get a tab by ID
export async function getTab(tabId) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([TABS_STORE], 'readonly');
    const store = transaction.objectStore(TABS_STORE);
    const request = store.get(tabId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Remove a tab from the index
export async function removeTab(tabId) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([TABS_STORE], 'readwrite');
    const store = transaction.objectStore(TABS_STORE);
    const request = store.delete(tabId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Get all tabs
export async function getAllTabs() {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([TABS_STORE], 'readonly');
    const store = transaction.objectStore(TABS_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Clear all tabs from the index
export async function clearAllTabs() {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([TABS_STORE], 'readwrite');
    const store = transaction.objectStore(TABS_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Search tabs with fuzzy matching
export async function searchTabs(query, limit = 5) {
  if (!query || query.trim() === '') {
    return [];
  }

  const allTabs = await getAllTabs();
  const normalizedQuery = query.toLowerCase().trim();
  const queryTerms = normalizedQuery.split(/\s+/);

  // Score each tab
  const scored = allTabs.map(tab => {
    const score = calculateScore(tab, queryTerms, normalizedQuery);
    return { ...tab, score };
  });

  // Sort by score (highest first), then by lastAccessed (most recent first)
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.lastAccessed - a.lastAccessed;
  });

  // Filter out zero scores and limit results
  return scored.filter(tab => tab.score > 0).slice(0, limit);
}

// Calculate relevance score for a tab
function calculateScore(tab, queryTerms, fullQuery) {
  let score = 0;
  const title = (tab.title || '').toLowerCase();
  const url = (tab.url || '').toLowerCase();
  const description = (tab.metaDescription || '').toLowerCase();
  const keywords = (tab.metaKeywords || '').toLowerCase();

  // Exact title match (highest score)
  if (title === fullQuery) {
    score += 100;
  }
  // Title starts with query
  else if (title.startsWith(fullQuery)) {
    score += 80;
  }
  // Title contains query
  else if (title.includes(fullQuery)) {
    score += 60;
  }

  // URL contains query
  if (url.includes(fullQuery)) {
    score += 40;
  }

  // Check each query term
  for (const term of queryTerms) {
    if (term.length < 2) continue;

    // Term matches in title
    if (title.includes(term)) {
      score += 20;
    }

    // Term matches in URL
    if (url.includes(term)) {
      score += 15;
    }

    // Term matches in description
    if (description.includes(term)) {
      score += 10;
    }

    // Term matches in keywords
    if (keywords.includes(term)) {
      score += 10;
    }

    // Fuzzy matching - check for partial matches
    const fuzzyScore = fuzzyMatch(term, title);
    if (fuzzyScore > 0.6) {
      score += Math.floor(fuzzyScore * 15);
    }
  }

  return score;
}

// Simple fuzzy matching (returns 0-1 score)
function fuzzyMatch(needle, haystack) {
  if (needle.length === 0) return 0;
  if (haystack.length === 0) return 0;
  if (needle === haystack) return 1;
  if (haystack.includes(needle)) return 0.9;

  let needleIdx = 0;
  let matches = 0;

  for (let i = 0; i < haystack.length && needleIdx < needle.length; i++) {
    if (haystack[i] === needle[needleIdx]) {
      matches++;
      needleIdx++;
    }
  }

  // If we didn't match all characters, return partial score
  if (needleIdx < needle.length) {
    return matches / needle.length * 0.5;
  }

  return matches / needle.length;
}

// Get tabs sorted by last accessed (for recent tabs list)
export async function getRecentTabs(excludeTabId = null, limit = 10) {
  const allTabs = await getAllTabs();

  return allTabs
    .filter(tab => tab.id !== excludeTabId)
    .sort((a, b) => b.lastAccessed - a.lastAccessed)
    .slice(0, limit);
}

// ============================================================================
// Bookmark Usage Functions
// ============================================================================

// Add or update bookmark usage
export async function upsertBookmarkUsage(bookmarkData) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([BOOKMARKS_STORE], 'readwrite');
    const store = transaction.objectStore(BOOKMARKS_STORE);

    const data = {
      id: bookmarkData.id,
      url: bookmarkData.url || '',
      lastAccessed: bookmarkData.lastAccessed || Date.now(),
      accessCount: bookmarkData.accessCount || 1
    };

    const request = store.put(data);
    request.onsuccess = () => resolve(data);
    request.onerror = () => reject(request.error);
  });
}

// Get bookmark usage by ID
export async function getBookmarkUsage(bookmarkId) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([BOOKMARKS_STORE], 'readonly');
    const store = transaction.objectStore(BOOKMARKS_STORE);
    const request = store.get(bookmarkId);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Get all bookmark usage data
export async function getAllBookmarkUsage() {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([BOOKMARKS_STORE], 'readonly');
    const store = transaction.objectStore(BOOKMARKS_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

// Remove bookmark usage by ID
export async function removeBookmarkUsage(bookmarkId) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([BOOKMARKS_STORE], 'readwrite');
    const store = transaction.objectStore(BOOKMARKS_STORE);
    const request = store.delete(bookmarkId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// Recently Accessed Functions
// ============================================================================

// Add tab to recently accessed (maintains 10-item cap)
export async function addRecentlyAccessed(tabData) {
  const database = await initDB();

  return new Promise(async (resolve, reject) => {
    try {
      const transaction = database.transaction([RECENTLY_ACCESSED_STORE], 'readwrite');
      const store = transaction.objectStore(RECENTLY_ACCESSED_STORE);

      // Add or update the tab
      const data = {
        id: tabData.id,
        windowId: tabData.windowId,
        title: tabData.title || '',
        url: tabData.url || '',
        favIconUrl: tabData.favIconUrl || '',
        accessedAt: tabData.accessedAt || Date.now()
      };

      store.put(data);

      // Get all items sorted by accessedAt
      const index = store.index('accessedAt');
      const getAllRequest = index.openCursor(null, 'prev');
      const items = [];

      getAllRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          // If we have more than 10 items, delete the oldest ones
          if (items.length > 10) {
            const itemsToDelete = items.slice(10);
            itemsToDelete.forEach(item => {
              store.delete(item.id);
            });
          }
        }
      };

      transaction.oncomplete = () => resolve(data);
      transaction.onerror = () => reject(transaction.error);
    } catch (error) {
      reject(error);
    }
  });
}

// Get recently accessed tabs (sorted by most recent)
export async function getRecentlyAccessed(limit = 10) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([RECENTLY_ACCESSED_STORE], 'readonly');
    const store = transaction.objectStore(RECENTLY_ACCESSED_STORE);
    const index = store.index('accessedAt');
    const request = index.openCursor(null, 'prev');
    const results = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

// Remove tab from recently accessed
export async function removeRecentlyAccessed(tabId) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([RECENTLY_ACCESSED_STORE], 'readwrite');
    const store = transaction.objectStore(RECENTLY_ACCESSED_STORE);
    const request = store.delete(tabId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Clear all recently accessed tabs
export async function clearRecentlyAccessed() {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([RECENTLY_ACCESSED_STORE], 'readwrite');
    const store = transaction.objectStore(RECENTLY_ACCESSED_STORE);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ============================================================================
// Settings Functions (simple key-value store)
// ============================================================================

// Set a setting value
export async function setSetting(key, value) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SETTINGS_STORE], 'readwrite');
    const store = transaction.objectStore(SETTINGS_STORE);
    const request = store.put({ key, value });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Get a setting value
export async function getSetting(key) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SETTINGS_STORE], 'readonly');
    const store = transaction.objectStore(SETTINGS_STORE);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result?.value ?? null);
    request.onerror = () => reject(request.error);
  });
}

// Remove a setting
export async function removeSetting(key) {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([SETTINGS_STORE], 'readwrite');
    const store = transaction.objectStore(SETTINGS_STORE);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
