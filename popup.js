// TabLight Popup Script
import { setSetting } from './db.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Detect OS using Chrome API and show appropriate shortcut
  const platformInfo = await chrome.runtime.getPlatformInfo();
  const isMac = platformInfo.os === 'mac';
  const shortcutEl = document.getElementById('shortcut');
  shortcutEl.textContent = isMac ? '⌘ + Shift + K' : 'Ctrl + Shift + K';

  // Settings button handler - opens sidepanel to Settings tab
  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn.addEventListener('click', async () => {
    // Get current window to open sidepanel in
    const currentWindow = await chrome.windows.getCurrent();
    // Set side panel to open Settings tab
    await setSetting('sidePanelTab', 'settings');
    await chrome.sidePanel.open({ windowId: currentWindow.id });
    // Close popup after opening sidepanel
    window.close();
  });
});
