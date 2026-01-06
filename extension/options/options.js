// Web2PG Options Script
import { DEFAULT_SETTINGS, SETTINGS_KEYS } from '../shared/constants.js';

// Load settings when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
});

function setupEventListeners() {
  // Form submission
  document.getElementById('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettings();
  });

  // Reset button
  document.getElementById('resetBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      resetToDefaults();
    }
  });
}

function loadSettings() {
  chrome.storage.local.get(Object.values(SETTINGS_KEYS), (result) => {
    // Set form values
    for (const [key, value] of Object.entries(SETTINGS_KEYS)) {
      const element = document.querySelector(`[name="${value}"]`);
      if (element) {
        const storedValue = result[value];
        if (storedValue !== undefined) {
          if (element.type === 'checkbox') {
            element.checked = storedValue;
          } else {
            element.value = storedValue;
          }
        }
      }
    }
  });
}

function saveSettings() {
  const settings = {};

  // Collect form values
  for (const key of Object.values(SETTINGS_KEYS)) {
    const element = document.querySelector(`[name="${key}"]`);
    if (element) {
      if (element.type === 'checkbox') {
        settings[key] = element.checked;
      } else if (element.type === 'number') {
        settings[key] = parseInt(element.value) || 0;
      } else {
        settings[key] = element.value;
      }
    }
  }

  // Save to storage
  chrome.storage.local.set(settings, () => {
    showStatus('Settings saved successfully!', 'success');
  });
}

function resetToDefaults() {
  chrome.storage.local.set(DEFAULT_SETTINGS, () => {
    loadSettings();
    showStatus('Settings reset to defaults', 'success');
  });
}

function showStatus(message, type) {
  const statusElement = document.getElementById('statusMessage');
  statusElement.textContent = message;
  statusElement.className = `status-message ${type}`;

  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusElement.className = 'status-message';
  }, 3000);
}
