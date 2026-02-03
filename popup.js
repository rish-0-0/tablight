// TabLight Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  // Detect OS using Chrome API and show appropriate shortcut
  const platformInfo = await chrome.runtime.getPlatformInfo();
  const isMac = platformInfo.os === 'mac';
  const shortcutEl = document.getElementById('shortcut');
  shortcutEl.textContent = isMac ? '⌘ + Shift + K' : 'Ctrl + Shift + K';

  // Settings button handler - opens sidepanel
  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn.addEventListener('click', async () => {
    // Get current window to open sidepanel in
    const currentWindow = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: currentWindow.id });
    // Close popup after opening sidepanel
    window.close();
  });
});
