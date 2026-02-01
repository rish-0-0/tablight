// TabLight Background Service Worker
import {
  initDB,
  upsertTab,
  removeTab,
  getAllTabs,
  clearAllTabs,
  searchTabs,
  getRecentTabs
} from './db.js';

// Track tab activity order in memory (most recent at the end)
let tabActivityOrder = [];

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
  await initialize();
});

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
  await initialize();
});

// Initialize the extension
async function initialize() {
  try {
    await initDB();

    // Clear stale data and rebuild index from current tabs
    await clearAllTabs();

    // Get all current tabs and index them
    const tabs = await chrome.tabs.query({});
    tabActivityOrder = [];

    for (const tab of tabs) {
      tabActivityOrder.push(tab.id);
      await indexTab(tab);
    }

  } catch {
    // Initialization error, will retry on next event
  }
}

// Index a single tab
async function indexTab(tab) {
  if (!tab || !tab.id) return;

  // Skip chrome:// and other restricted URLs
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    return;
  }

  await upsertTab({
    id: tab.id,
    windowId: tab.windowId,
    title: tab.title || '',
    url: tab.url || '',
    favIconUrl: tab.favIconUrl || '',
    lastAccessed: Date.now()
  });
}

// Check if a tab can receive messages (has content script)
function canMessageTab(tab) {
  if (!tab || !tab.url) return false;
  const url = tab.url;
  // Can't message chrome://, chrome-extension://, about:, or file:// pages
  return !url.startsWith('chrome://') &&
         !url.startsWith('chrome-extension://') &&
         !url.startsWith('about:') &&
         !url.startsWith('file://') &&
         !url.startsWith('edge://') &&
         !url.startsWith('brave://');
}

// Request meta tags from content script
async function requestMetaTags(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!canMessageTab(tab)) return;

    const response = await chrome.tabs.sendMessage(tabId, { action: 'get-meta-tags' }).catch(() => null);
    if (response && response.meta) {
      await upsertTab({
        id: tab.id,
        windowId: tab.windowId,
        title: tab.title || '',
        url: tab.url || '',
        favIconUrl: tab.favIconUrl || '',
        metaDescription: response.meta.description || '',
        metaKeywords: response.meta.keywords || '',
        lastAccessed: Date.now()
      });
    }
  } catch {
    // Tab might not exist or content script not loaded, ignore silently
  }
}

// Tab created
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!tabActivityOrder.includes(tab.id)) {
    tabActivityOrder.push(tab.id);
  }
  await indexTab(tab);
});

// Tab updated (URL change, title change, etc.)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only reindex when the tab finishes loading
  if (changeInfo.status === 'complete') {
    await indexTab(tab);
    // Request meta tags after page loads
    setTimeout(() => requestMetaTags(tabId), 500);
  }
});

// Tab activated (user switches to tab)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tabId = activeInfo.tabId;

  // Update activity order
  tabActivityOrder = tabActivityOrder.filter(id => id !== tabId);
  tabActivityOrder.push(tabId);

  // Update lastAccessed in the index
  try {
    const tab = await chrome.tabs.get(tabId);
    await indexTab(tab);
  } catch (error) {
    // Tab might not exist anymore
  }
});

// Tab removed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  tabActivityOrder = tabActivityOrder.filter(id => id !== tabId);
  await removeTab(tabId);
});

// Handle keyboard command
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-tablight') {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && canMessageTab(activeTab)) {
        await chrome.tabs.sendMessage(activeTab.id, { action: 'toggle-overlay' }).catch(() => {
          // Content script not ready, ignore silently
        });
      }
    } catch {
      // Ignore errors silently
    }
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse);
  return true; // Keep message channel open for async response
});

async function handleMessage(request, sender) {
  switch (request.action) {
    case 'search-tabs': {
      const currentTabId = sender.tab?.id;
      const query = request.query || '';

      if (!query.trim()) {
        // Return recent tabs when no query
        const recentTabs = await getRecentTabs(currentTabId, 5);
        return {
          tabs: recentTabs,
          recentlyClosed: await getRecentlyClosedTabs(5)
        };
      }

      // Search indexed tabs
      const searchResults = await searchTabs(query, 5);

      // Filter out current tab from results
      const filteredResults = searchResults.filter(tab => tab.id !== currentTabId);

      // Get recently closed tabs matching the query
      const recentlyClosed = await searchRecentlyClosed(query, 5);

      return {
        tabs: filteredResults,
        recentlyClosed
      };
    }

    case 'get-recent-tabs': {
      const currentTabId = sender.tab?.id;
      const recentTabs = await getRecentTabs(currentTabId, 5);
      const recentlyClosed = await getRecentlyClosedTabs(5);

      return {
        tabs: recentTabs,
        recentlyClosed
      };
    }

    case 'switch-to-tab': {
      await chrome.tabs.update(request.tabId, { active: true });
      await chrome.windows.update(request.windowId, { focused: true });
      return { success: true };
    }

    case 'restore-session': {
      // Restore a recently closed tab
      await chrome.sessions.restore(request.sessionId);
      return { success: true };
    }

    case 'meta-tags-extracted': {
      // Content script sends meta tags after page load
      if (sender.tab) {
        const tab = sender.tab;
        await upsertTab({
          id: tab.id,
          windowId: tab.windowId,
          title: tab.title || '',
          url: tab.url || '',
          favIconUrl: tab.favIconUrl || '',
          metaDescription: request.meta?.description || '',
          metaKeywords: request.meta?.keywords || '',
          lastAccessed: Date.now()
        });
      }
      return { success: true };
    }

    default:
      return { error: 'Unknown action' };
  }
}

// Get recently closed tabs
async function getRecentlyClosedTabs(limit = 5) {
  try {
    const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: limit * 2 });

    return sessions
      .filter(session => session.tab) // Only tabs, not windows
      .slice(0, limit)
      .map(session => ({
        sessionId: session.tab.sessionId,
        title: session.tab.title || 'Untitled',
        url: session.tab.url || '',
        favIconUrl: session.tab.favIconUrl || '',
        isRecentlyClosed: true
      }));
  } catch {
    return [];
  }
}

// Search recently closed tabs with fuzzy matching
async function searchRecentlyClosed(query, limit = 5) {
  try {
    const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 25 });
    const normalizedQuery = query.toLowerCase().trim();

    const matches = sessions
      .filter(session => session.tab)
      .map(session => {
        const tab = session.tab;
        const title = (tab.title || '').toLowerCase();
        const url = (tab.url || '').toLowerCase();

        // Simple matching score
        let score = 0;
        if (title.includes(normalizedQuery)) score += 50;
        if (url.includes(normalizedQuery)) score += 30;

        // Partial word matching
        const words = normalizedQuery.split(/\s+/);
        for (const word of words) {
          if (title.includes(word)) score += 10;
          if (url.includes(word)) score += 5;
        }

        return {
          sessionId: tab.sessionId,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          favIconUrl: tab.favIconUrl || '',
          isRecentlyClosed: true,
          score
        };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return matches;
  } catch {
    return [];
  }
}

// Initialize immediately when service worker loads
initialize();
