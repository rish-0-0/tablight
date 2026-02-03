// TabLight Sidepanel Script

document.addEventListener('DOMContentLoaded', async () => {
  // Detect OS using Chrome API
  const platformInfo = await chrome.runtime.getPlatformInfo();
  const isMac = platformInfo.os === 'mac';

  // Helper to create kbd elements
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

  // MRU Tab shortcut
  const mruShortcutEl = document.getElementById('mru-shortcut');
  mruShortcutEl.appendChild(createKbd('Alt'));
  mruShortcutEl.appendChild(createSeparator());
  mruShortcutEl.appendChild(createKbd('Q'));
});
