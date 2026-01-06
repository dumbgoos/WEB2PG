// Offscreen document for stitching screenshots
console.log('🖼️ Offscreen document loaded');

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'stitchScreenshots') {
    console.log('🖼️ Stitching screenshots:', request.screenshots.length);
    stitchScreenshots(request.screenshots, request.width, request.totalHeight)
      .then(dataUrl => {
        console.log('✅ Stitching completed');
        sendResponse({ success: true, dataUrl });
      })
      .catch(error => {
        console.error('❌ Stitching failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Async response
  }
  return false;
});

// Stitch multiple screenshots into one
async function stitchScreenshots(screenshots, width, totalHeight) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.getElementById('stitchCanvas');
      const ctx = canvas.getContext('2d');

      // Set canvas dimensions
      canvas.width = width;
      canvas.height = totalHeight;

      console.log(`🖼️ Canvas created: ${width}x${totalHeight}`);

      let loadedCount = 0;
      let currentY = 0;

      // Load and draw each screenshot
      screenshots.forEach((screenshot, index) => {
        const img = new Image();

        img.onload = () => {
          console.log(`✅ Screenshot ${index} loaded, drawing at y=${currentY}`);

          // Draw image on canvas
          ctx.drawImage(img, 0, currentY, width, img.height);

          // Move to next position
          currentY += img.height;
          loadedCount++;

          // If all screenshots loaded, convert to data URL
          if (loadedCount === screenshots.length) {
            console.log('✅ All screenshots drawn, converting to data URL');

            try {
              const dataUrl = canvas.toDataURL('image/png', 1.0);
              resolve(dataUrl);
            } catch (error) {
              reject(new Error(`Failed to convert canvas to data URL: ${error.message}`));
            }
          }
        };

        img.onerror = () => {
          reject(new Error(`Failed to load screenshot ${index}`));
        };

        img.src = screenshot.dataUrl;
      });
    } catch (error) {
      reject(error);
    }
  });
}
