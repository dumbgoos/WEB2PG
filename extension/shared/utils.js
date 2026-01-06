// Utility functions for Web2PG extension

import { DEFAULT_SETTINGS, SETTINGS_KEYS } from './constants.js';

/**
 * Load extension settings from storage
 */
export async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(Object.values(SETTINGS_KEYS), (result) => {
      const settings = { ...DEFAULT_SETTINGS };
      for (const key of Object.values(SETTINGS_KEYS)) {
        if (result[key] !== undefined) {
          settings[key] = result[key];
        }
      }
      resolve(settings);
    });
  });
}

/**
 * Save a setting to storage
 */
export async function saveSetting(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve();
    });
  });
}

/**
 * Normalize URL by removing tracking parameters
 */
export function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'msclkid'];

    trackingParams.forEach((param) => {
      urlObj.searchParams.delete(param);
    });

    return urlObj.toString();
  } catch (error) {
    return url;
  }
}

/**
 * Generate SHA-256 hash of content
 */
export async function generateContentHash(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract domain from URL
 */
export function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return '';
  }
}

/**
 * Calculate reading time from word count
 */
export function calculateReadingTime(wordCount) {
  const wordsPerMinute = 200;
  return Math.ceil(wordCount / wordsPerMinute);
}

/**
 * Estimate token count for text (rough approximation)
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Format number as readable string
 */
export function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

/**
 * Format date as readable string
 */
export function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Truncate text to specified length
 */
export function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

/**
 * Debounce function execution
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Make API request to proxy server
 */
export async function apiRequest(endpoint, options = {}) {
  console.log(`🌐 [API] apiRequest called for endpoint: ${endpoint}`);
  console.log(`🌐 [API] Options:`, {
    method: options.method,
    hasBody: !!options.body,
    bodyLength: options.body?.length || 0
  });

  const settings = await loadSettings();
  const proxyUrl = settings[SETTINGS_KEYS.PROXY_URL] || 'http://localhost:3000/api';

  const url = `${proxyUrl}${endpoint}`;
  console.log(`🌐 [API] Full URL: ${url}`);

  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  try {
    console.log('📤 [API] Sending fetch request...');
    const response = await fetch(url, { ...defaultOptions, ...options });

    console.log(`📥 [API] Response received:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      console.error(`❌ [API] Response not OK: ${response.status} ${response.statusText}`);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ [API] JSON response parsed:', {
      success: data.success,
      hasError: !!data.error,
      keys: Object.keys(data)
    });

    return data;
  } catch (error) {
    console.error('❌ [API] Request failed:', error);
    console.error('❌ [API] Error stack:', error.stack);
    throw error;
  }
}

/**
 * Show notification to user
 */
export function showNotification(title, message, type = 'info') {
  const notificationOptions = {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
    title,
    message,
    priority: type === 'error' ? 2 : 1,
  };

  chrome.notifications.create(notificationOptions);
}

/**
 * Get current tab URL
 */
export async function getCurrentTabUrl() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        resolve(tabs[0].url);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Check if URL is valid for saving
 */
export function isValidUrl(url) {
  if (!url) return false;

  try {
    const urlObj = new URL(url);
    const validProtocols = ['http:', 'https:'];
    return validProtocols.includes(urlObj.protocol);
  } catch (error) {
    return false;
  }
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate color from string (for tags)
 */
export function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 50%)`;
}
