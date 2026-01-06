// Web2PG Background Service Worker
// Author: Ling Luo
console.log('Web2PG service worker initialized');

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Web2PG extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // Open options page on first install
    chrome.runtime.openOptionsPage();
  }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Service worker received message:', request);

  switch (request.action) {
    case 'contentScriptLoaded':
      console.log('Content script loaded in tab:', sender.tab?.id);
      sendResponse({ success: true });
      break;

    case 'savePage':
      handleSavePage(request.data)
        .then((result) => sendResponse({ success: true, result }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true; // Async response

    case 'performSearch':
      handleSearch(request.query)
        .then((results) => sendResponse({ success: true, results }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true; // Async response

    case 'openOptions':
      chrome.runtime.openOptionsPage();
      sendResponse({ success: true });
      break;

    case 'captureScreenshot':
      handleCaptureScreenshot(request.tabId)
        .then((dataUrl) => sendResponse({ success: true, dataUrl }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true; // Async response

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }

  return false;
});

// Handle save page request
async function handleSavePage(data) {
  try {
    const response = await fetch('http://localhost:3000/api/pages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Save page error:', error);
    throw error;
  }
}

// Handle search request
async function handleSearch(query) {
  try {
    const response = await fetch('http://localhost:3000/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, limit: 20 }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result.results;
  } catch (error) {
    console.error('Search error:', error);
    throw error;
  }
}

// Handle screenshot capture with full page support
async function handleCaptureScreenshot(tabId) {
  try {
    console.log('📸 [BACKGROUND] Starting full page screenshot capture for tab:', tabId);

    // Step 1: Get page dimensions and prepare for full page screenshot
    const pageInfo = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: getPageDimensions
    });

    if (!pageInfo || !pageInfo[0] || !pageInfo[0].result) {
      throw new Error('Failed to get page dimensions');
    }

    const dimensions = pageInfo[0].result;
    console.log('📸 [BACKGROUND] Page dimensions:', dimensions);

    // If page fits in viewport, just capture visible area
    if (dimensions.fullHeight <= dimensions.viewportHeight) {
      console.log('📸 [BACKGROUND] Page fits in viewport, single screenshot');
      return await captureSingleScreenshot(tabId);
    }

    // Step 2: Capture full page with scrolling
    console.log('📸 [BACKGROUND] Page requires scrolling, capturing multiple sections');
    return await captureFullPageWithScrolling(tabId, dimensions);
  } catch (error) {
    console.error('❌ [BACKGROUND] Screenshot capture error:', error.message);
    // Don't throw - screenshot is optional
    return null;
  }
}

// Function to get page dimensions (injected into page)
function getPageDimensions() {
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

  return {
    fullHeight,
    viewportWidth,
    viewportHeight,
    scrollY: window.scrollY
  };
}

// Capture a single screenshot (for pages that fit in viewport)
async function captureSingleScreenshot(tabId) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Screenshot timeout')), 5000);
  });

  const capturePromise = chrome.tabs.captureVisibleTab(null, {
    format: 'png',
    quality: 100
  });

  const dataUrl = await Promise.race([capturePromise, timeoutPromise]);
  console.log('✅ [BACKGROUND] Single screenshot captured');
  return dataUrl;
}

// Capture full page by scrolling and stitching screenshots
async function captureFullPageWithScrolling(tabId, dimensions) {
  const { fullHeight, viewportWidth, viewportHeight, scrollY } = dimensions;
  const numScreenshots = Math.ceil(fullHeight / viewportHeight);

  console.log(`📸 [BACKGROUND] Capturing ${numScreenshots} screenshots to cover ${fullHeight}px`);

  // Save original scroll position
  const originalScrollY = scrollY;

  // Array to store screenshots
  const screenshots = [];

  try {
    // Capture each section
    for (let i = 0; i < numScreenshots; i++) {
      const targetScrollY = i * viewportHeight;

      // Scroll to position
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: scrollToPosition,
        args: [targetScrollY]
      });

      // Wait for scroll to complete and content to render
      await sleep(500);

      // Capture screenshot with retry logic
      let dataUrl;
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          dataUrl = await chrome.tabs.captureVisibleTab(null, {
            format: 'png',
            quality: 100
          });
          break; // Success, exit retry loop
        } catch (captureError) {
          retries++;
          console.warn(`⚠️ [BACKGROUND] Screenshot capture attempt ${retries} failed:`, captureError.message);

          if (retries >= maxRetries) {
            throw captureError; // All retries failed
          }

          // Wait before retry (with exponential backoff)
          const waitTime = Math.min(1000 * Math.pow(2, retries - 1), 3000);
          console.log(`⏳ [BACKGROUND] Waiting ${waitTime}ms before retry...`);
          await sleep(waitTime);
        }
      }

      screenshots.push({
        dataUrl,
        index: i,
        scrollY: targetScrollY
      });

      console.log(`✅ [BACKGROUND] Captured screenshot ${i + 1}/${numScreenshots}`);

      // Add delay between screenshots to respect rate limit
      // Chrome allows approximately 1 captureVisibleTab call per second
      if (i < numScreenshots - 1) {
        console.log(`⏳ [BACKGROUND] Waiting 1100ms to respect rate limit...`);
        await sleep(1100); // 1.1 seconds to be safe
      }
    }

    // Stitch screenshots together
    console.log('📸 [BACKGROUND] Stitching screenshots together...');
    const stitchedDataUrl = await stitchScreenshots(screenshots, viewportWidth, fullHeight);

    // Restore original scroll position
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: scrollToPosition,
      args: [originalScrollY]
    });

    console.log('✅ [BACKGROUND] Full page screenshot completed');
    return stitchedDataUrl;
  } catch (error) {
    // Restore scroll position on error
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: scrollToPosition,
        args: [originalScrollY]
      });
    } catch (e) {
      console.error('Failed to restore scroll position:', e);
    }
    throw error;
  }
}

// Function to scroll to position (injected into page)
function scrollToPosition(y) {
  window.scrollTo(0, y);
}

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Stitch multiple screenshots using offscreen document
async function stitchScreenshots(screenshots, width, totalHeight) {
  try {
    // Ensure offscreen document exists
    await ensureOffscreenDocument();

    // Send screenshots to offscreen document for stitching
    const response = await chrome.runtime.sendMessage({
      action: 'stitchScreenshots',
      screenshots: screenshots,
      width: width,
      totalHeight: totalHeight
    });

    if (response && response.success) {
      return response.dataUrl;
    } else {
      throw new Error(response?.error || 'Failed to stitch screenshots');
    }
  } catch (error) {
    console.error('❌ Stitching error:', error);
    throw error;
  }
}

// Ensure offscreen document is created
async function ensureOffscreenDocument() {
  // If already created or being created, wait for it
  if (offscreenDocumentCreated) {
    return;
  }

  // If another call is already creating, wait for it
  if (offscreenDocumentCreating) {
    console.log('⏳ Offscreen document creation in progress, waiting...');
    // Wait up to 5 seconds for creation to complete
    for (let i = 0; i < 50; i++) {
      await sleep(100);
      if (offscreenDocumentCreated) {
        console.log('✅ Offscreen document ready (was already being created)');
        return;
      }
    }
    throw new Error('Timeout waiting for offscreen document creation');
  }

  // Mark as creating
  offscreenDocumentCreating = true;

  try {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
      console.log('✅ Offscreen document already exists');
      offscreenDocumentCreated = true;
      offscreenDocumentCreating = false;
      return;
    }

    // Create offscreen document
    console.log('🔨 Creating new offscreen document...');
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['DOM_SCRAPING'],
      justification: 'Need to stitch screenshots using Canvas API'
    });

    offscreenDocumentCreated = true;
    console.log('✅ Offscreen document created successfully');
  } catch (error) {
    // If it's already exists error, mark as created and continue
    if (error.message && error.message.includes('already exists')) {
      console.log('✅ Offscreen document already exists (caught error)');
      offscreenDocumentCreated = true;
    } else {
      console.error('❌ Failed to create offscreen document:', error);
      throw error;
    }
  } finally {
    offscreenDocumentCreating = false;
  }
}

// Keep service worker alive (for development)
// In production, consider using alarms for periodic tasks
let keepAliveInterval;

// Track offscreen document creation state
let offscreenDocumentCreating = false;
let offscreenDocumentCreated = false;

function startKeepAlive() {
  if (keepAliveInterval) return;

  keepAliveInterval = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {
      // Just ping the runtime to keep service worker alive
    });
  }, 20000); // Every 20 seconds
}

chrome.alarms.create('keepAlive', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // Service worker keep-alive
  }
});

// Log service worker status changes
self.addEventListener('activate', (event) => {
  console.log('Service worker activated');
  event.waitUntil(self.clients.claim());
});

console.log('Web2PG service worker ready');
