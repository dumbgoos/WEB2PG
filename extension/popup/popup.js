// Web2PG Popup Script
// Author: Ling Luo
import { apiRequest, showNotification } from '../shared/utils.js';

class PopupManager {
  constructor() {
    this.currentTab = null;
    this.searchTimeout = null;
    this.init();
  }

  async init() {
    // Get current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    this.currentTab = tabs[0];

    // Setup event listeners
    this.setupEventListeners();

    // Load page info
    this.loadCurrentPageInfo();

    // Check connection
    this.checkConnection();

    // Load statistics
    this.loadStatistics();
  }

  setupEventListeners() {
    // Save page button
    document.getElementById('savePageBtn').addEventListener('click', () => this.saveCurrentPage());

    // Options button
    document.getElementById('optionsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Search input with debounce
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => this.performSearch(e.target.value), 300);
    });

    // Search button
    document.getElementById('searchBtn').addEventListener('click', () => {
      this.performSearch(searchInput.value);
    });
  }

  async loadCurrentPageInfo() {
    if (!this.currentTab) return;

    const urlElement = document.getElementById('currentPageUrl');
    const titleElement = document.getElementById('currentPageTitle');

    urlElement.textContent = this.currentTab.url;
    titleElement.textContent = this.currentTab.title;
  }

  async checkConnection() {
    const statusElement = document.getElementById('connectionStatus');
    const statusText = statusElement.querySelector('.status-text');

    try {
      const response = await fetch('http://localhost:3000/health');

      if (response.ok) {
        statusElement.classList.remove('disconnected');
        statusElement.classList.add('connected');
        statusText.textContent = 'Connected to proxy';
      } else {
        throw new Error('Proxy not responding');
      }
    } catch (error) {
      statusElement.classList.remove('connected');
      statusElement.classList.add('disconnected');
      statusText.textContent = 'Proxy not connected';
      console.error('Connection check failed:', error);
    }
  }

  async loadStatistics() {
    try {
      const data = await apiRequest('/stats');

      if (data.success) {
        document.getElementById('totalPages').textContent = data.stats.total_pages || 0;
        document.getElementById('totalTags').textContent = data.stats.total_tags || 0;
        document.getElementById('totalImages').textContent = data.stats.downloaded_images || 0;
      }
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  }

  async saveCurrentPage() {
    console.log('🟢 [FRONTEND] saveCurrentPage called');

    if (!this.currentTab) {
      console.error('❌ [FRONTEND] No active tab');
      this.showStatus('No active tab', 'error');
      return;
    }

    // Check if on a restricted page
    if (this.currentTab.url.startsWith('chrome://') ||
        this.currentTab.url.startsWith('chrome-extension://') ||
        this.currentTab.url.startsWith('edge://') ||
        this.currentTab.url.startsWith('about:')) {
      console.warn('⚠️ [FRONTEND] Restricted page detected');
      this.showStatus('Cannot save restricted pages. Navigate to a regular website.', 'error');
      return;
    }

    const saveBtn = document.getElementById('savePageBtn');
    const enableOCRCheckbox = document.getElementById('enableOCR');
    const enableOCR = enableOCRCheckbox.checked;

    console.log(`📋 [FRONTEND] OCR enabled: ${enableOCR}`);

    // Disable button and show loading
    saveBtn.disabled = true;
    this.showStatus('Extracting page content...', 'loading');

    try {
      console.log('📤 [FRONTEND] Injecting content script...');
      // First, try to inject content script to ensure it's loaded
      await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        files: ['content/content-script.js']
      });
      console.log('✅ [FRONTEND] Content script injected');

      // Wait a bit for the script to initialize
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log('📨 [FRONTEND] Sending extractPageData message to content script...');
      // Send message to content script to extract page data
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'extractPageData',
        tabId: this.currentTab.id
      });

      console.log('📨 [FRONTEND] Received response from content script:', response);

      if (!response.success) {
        console.error('❌ [FRONTEND] Content script extraction failed:', response.error);
        throw new Error(response.error || 'Failed to extract page data');
      }

      // Debug: log extracted data
      console.log('✅ [FRONTEND] Extracted page data:', {
        url: response.data.url,
        title: response.data.title,
        tagsCount: response.data.tags?.length || 0,
        imagesCount: response.data.images?.length || 0,
        linksCount: response.data.links?.length || 0,
        enableOCR: enableOCR,
        hasScreenshot: !!response.data.screenshot
      });

      console.log('🔍 [FRONTEND] Checking if OCR is enabled:', enableOCR);

      // If OCR is enabled, capture full page screenshot
      if (enableOCR) {
        console.log('✅ [FRONTEND] OCR is enabled, proceeding with screenshot capture');
        this.showStatus('Capturing full page screenshot...', 'loading');

        try {
          // Request screenshot from background service worker (has proper permissions)
          console.log('📸 [FRONTEND] Sending captureScreenshot message to background...');
          const screenshotResponse = await chrome.runtime.sendMessage({
            action: 'captureScreenshot',
            tabId: this.currentTab.id
          });

          console.log('📸 [FRONTEND] Screenshot response received:', screenshotResponse);

          if (screenshotResponse && screenshotResponse.success && screenshotResponse.dataUrl) {
            console.log('✅ [FRONTEND] Screenshot captured, length:', screenshotResponse.dataUrl.length);
            response.data.screenshot = screenshotResponse.dataUrl;
            response.data.enableOCR = true;
          } else {
            console.warn('⚠️ [FRONTEND] Screenshot failed or empty, continuing without OCR');
            response.data.enableOCR = false;
          }
        } catch (screenshotError) {
          console.error('❌ [FRONTEND] Screenshot capture failed:', screenshotError);
          console.error('❌ [FRONTEND] Screenshot error stack:', screenshotError.stack);
          // Continue without screenshot
          response.data.enableOCR = false;
        }
      } else {
        console.log('ℹ️ [FRONTEND] OCR is disabled, skipping screenshot');
      }

      console.log('💾 [FRONTEND] Sending data to proxy server...');
      console.log('💾 [FRONTEND] Payload size:', JSON.stringify(response.data).length);

      if (enableOCR) {
        this.showStatus('Capturing screenshot and running OCR + LLM analysis...', 'loading');
      } else {
        this.showStatus('Saving to archive...', 'loading');
      }

      // Send to proxy server
      const result = await apiRequest('/pages', {
        method: 'POST',
        body: JSON.stringify(response.data),
      });

      console.log('📥 [FRONTEND] Received response from proxy server:', result);

      if (result.success) {
        if (result.action === 'duplicate_found') {
          console.log('⚠️ [FRONTEND] Duplicate page found');
          this.showStatus(`Duplicate found: ${result.duplicate.url}`, 'warning');
        } else {
          console.log('✅ [FRONTEND] Page saved successfully');
          console.log(`   - OCR completed: ${result.ocrCompleted}`);
          console.log(`   - OCR analysis:`, result.ocrAnalysis);

          // Show detailed success message
          let message = `Page saved! ID: ${result.pageId}`;
          if (result.tagsProcessed > 0) {
            message += ` (${result.tagsProcessed} tags)`;
          }
          if (result.ocrCompleted) {
            const analysis = result.ocrAnalysis || {};
            const tagCount = (analysis.tags?.length || 0) +
                           (analysis.actors?.length || 0) +
                           (analysis.categories?.length || 0);
            message += ` + OCR + LLM`;
            if (tagCount > 0) {
              message += ` (${tagCount} extracted tags)`;
            }
          }
          this.showStatus(message, 'success');

          // Refresh statistics
          this.loadStatistics();
        }
      } else {
        console.error('❌ [FRONTEND] Proxy server returned error:', result.error);
        throw new Error(result.error || 'Failed to save page');
      }
    } catch (error) {
      console.error('❌ [FRONTEND] Save error:', error);
      console.error('❌ [FRONTEND] Error stack:', error.stack);
      this.showStatus(`Error: ${error.message}`, 'error');
    } finally {
      console.log('🔄 [FRONTEND] Re-enabling save button');
      // Re-enable button
      setTimeout(() => {
        saveBtn.disabled = false;
      }, 1000);
    }
  }

  async captureFullPageScreenshot() {
    console.log('📸 [SCREENSHOT] captureFullPageScreenshot called');
    try {
      // Inject a script to capture full page screenshot
      const results = await chrome.scripting.executeScript({
      target: { tabId: this.currentTab.id },
      func: async () => {
        // Get full page height
        const body = document.body;
        const html = document.documentElement;
        const fullHeight = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          html.clientHeight,
          html.scrollHeight,
          html.offsetHeight
        );

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Calculate number of screenshots needed
        const numScreenshots = Math.ceil(fullHeight / viewportHeight);

        console.log(`Full height: ${fullHeight}, Viewport: ${viewportHeight}x${viewportHeight}, Need ${numScreenshots} screenshots`);

        // Return page info for background script to capture
        return {
          fullHeight,
          viewportWidth,
          viewportHeight,
          numScreenshots,
          scrollY: window.scrollY
        };
      }
    });

    const pageInfo = results[0].result;
    console.log('📸 [SCREENSHOT] Page info extracted:', pageInfo);

    // Now capture multiple screenshots and stitch them
    // For now, just capture the visible area (simple version)
    // TODO: Implement full page stitching
    console.log('📸 [SCREENSHOT] Calling captureVisibleTab...');

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Screenshot capture timeout after 10s')), 10000);
    });

    const capturePromise = chrome.tabs.captureVisibleTab(chrome.windows.WINDOW_ID_CURRENT, {
      format: 'png',
      quality: 100
    });

    const dataUrl = await Promise.race([capturePromise, timeoutPromise]);
    console.log('✅ [SCREENSHOT] captureVisibleTab succeeded, length:', dataUrl.length);

    return dataUrl;
    } catch (error) {
      console.error('❌ [SCREENSHOT] Error in captureFullPageScreenshot:', error);
      console.error('❌ [SCREENSHOT] Error name:', error.name);
      console.error('❌ [SCREENSHOT] Error message:', error.message);
      throw error;
    }
  }

  async performSearch(query) {
    const resultsSection = document.getElementById('resultsSection');
    const resultsContainer = document.getElementById('searchResults');
    const resultsCount = document.getElementById('resultsCount');

    // Clear results if query is empty
    if (!query || query.trim().length < 2) {
      resultsSection.style.display = 'none';
      resultsContainer.innerHTML = '';
      return;
    }

    try {
      const data = await apiRequest('/search', {
        method: 'POST',
        body: JSON.stringify({
          query: query.trim(),
          limit: 10,
        }),
      });

      if (data.success) {
        this.displayResults(data.results, query);
        resultsCount.textContent = `${data.count} results`;
        resultsSection.style.display = 'block';
      }
    } catch (error) {
      console.error('Search error:', error);
      resultsContainer.innerHTML = '<div class="no-results">Search failed. Please try again.</div>';
      resultsSection.style.display = 'block';
    }
  }

  displayResults(results, query) {
    const resultsContainer = document.getElementById('searchResults');

    if (!results || results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="no-results">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
          <p>No results found for "${escapeHtml(query)}"</p>
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = results
      .map(
        (result) => `
      <div class="search-result" data-url="${escapeHtml(result.url)}">
        <div class="search-result-title">${this.highlightMatch(result.title, query)}</div>
        <div class="search-result-url">${escapeHtml(result.url)}</div>
        ${
          result.excerpt
            ? `<div class="search-result-excerpt">${this.highlightMatch(result.excerpt, query)}</div>`
            : ''
        }
        <div class="search-result-meta">
          <span>${escapeHtml(result.domain || '')}</span>
          <span>${this.formatDate(result.first_seen_at)}</span>
        </div>
        ${
          result.tags && result.tags.length > 0
            ? `<div class="search-result-tags">
            ${result.tags
              .filter((t) => t)
              .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
          </div>`
            : ''
        }
      </div>
    `
      )
      .join('');

    // Add click listeners to open results
    resultsContainer.querySelectorAll('.search-result').forEach((element) => {
      element.addEventListener('click', () => {
        const url = element.dataset.url;
        chrome.tabs.create({ url });
      });
    });
  }

  highlightMatch(text, query) {
    if (!text || !query) return escapeHtml(text || '');

    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark>$1</mark>');
  }

  formatDate(dateString) {
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

  showStatus(message, type) {
    const statusElement = document.getElementById('saveStatus');
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
  }
}

// Utility function to escape HTML
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});
