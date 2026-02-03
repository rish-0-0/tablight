// TabLight Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  // Detect OS using Chrome API and show appropriate shortcut
  const platformInfo = await chrome.runtime.getPlatformInfo();
  const isMac = platformInfo.os === 'mac';
  const shortcutEl = document.getElementById('shortcut');
  shortcutEl.textContent = isMac ? '⌘ + Shift + K' : 'Ctrl + Shift + K';

  // Settings button handler
  const settingsBtn = document.getElementById('settings-btn');
  settingsBtn.addEventListener('click', () => {
    // TODO: Open Chrome sidepanel with settings
    console.log('Settings clicked - sidepanel integration pending');
  });
});
