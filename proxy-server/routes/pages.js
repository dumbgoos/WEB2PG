// Pages API routes
import express from 'express';
import * as queries from '../database/queries.js';

const router = express.Router();

// Helper function to process OCR
async function processOCR(screenshot, url, title, content = null, existingTags = []) {
  console.log('🔧 [PAGES-OCR] processOCR called');
  console.log(`🔧 [PAGES-OCR] URL: ${url}`);
  console.log(`🔧 [PAGES-OCR] Title: ${title}`);
  console.log(`🔧 [PAGES-OCR] Screenshot length: ${screenshot?.length || 0}`);
  console.log(`🔧 [PAGES-OCR] Has content: ${!!content}`);
  console.log(`🔧 [PAGES-OCR] Existing tags: ${existingTags.length}`);

  try {
    console.log('📤 [PAGES-OCR] Sending request to /api/ocr...');
    const response = await fetch('http://localhost:3000/api/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: screenshot,
        url,
        title,
        content: content ? {
          text: content.text?.substring(0, 5000) || '', // First 5000 chars
          excerpt: content.excerpt || '',
          wordCount: content.wordCount || 0
        } : null,
        existingTags: existingTags.slice(0, 10) // Max 10 existing tags
      }),
    });

    console.log(`📥 [PAGES-OCR] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      console.error('❌ [PAGES-OCR] Response not OK');
      throw new Error(`OCR request failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ [PAGES-OCR] OCR result received:', {
      success: result.success,
      hasOcrText: !!result.ocr_text,
      ocrTextLength: result.ocr_text?.length || 0,
      hasAnalysis: !!result.analysis,
      tagsCount: result.analysis?.tags?.length || 0,
      actorsCount: result.analysis?.actors?.length || 0
    });
    return result;
  } catch (error) {
    console.error('❌ [PAGES-OCR] OCR processing error:', error);
    console.error('❌ [PAGES-OCR] Error stack:', error.stack);
    return null;
  }
}

// POST /api/pages - Save new page
router.post('/', async (req, res) => {
  const db = req.app.locals.db;

  console.log('🟢 [BACKEND] POST /api/pages called');

  try {
    const {
      url,
      title,
      content,
      images = [],
      links = [],
      tags = [],
      metadata = {},
      screenshot = null,
      enableOCR = false,
    } = req.body;

    console.log('📥 [BACKEND] Request data:', {
      url,
      title,
      hasContent: !!content,
      imagesCount: images.length,
      linksCount: links.length,
      tagsCount: tags.length,
      hasScreenshot: !!screenshot,
      screenshotLength: screenshot?.length || 0,
      enableOCR
    });

    // Validate required fields
    if (!url) {
      console.error('❌ [BACKEND] URL is required');
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Normalize URL and extract domain
    let domain;
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname;
    } catch (error) {
      return res.status(400).json({ success: false, error: 'Invalid URL' });
    }

    // Check for duplicates before inserting
    const duplicateByUrl = await queries.findDuplicateByUrl(db, url, url);
    if (duplicateByUrl) {
      return res.json({
        success: true,
        action: 'duplicate_found',
        duplicate: {
          id: duplicateByUrl.id,
          url: duplicateByUrl.url,
          title: duplicateByUrl.title,
          reason: 'exact_url',
          confidence: 1.0,
        },
      });
    }

    // Check content hash duplicate
    if (content?.text) {
      const crypto = await import('crypto');
      const contentHash = crypto.createHash('sha256').update(content.text).digest('hex');
      const duplicateByHash = await queries.findDuplicateByContentHash(db, contentHash);
      if (duplicateByHash) {
        return res.json({
          success: true,
          action: 'duplicate_found',
          duplicate: {
            id: duplicateByHash.id,
            url: duplicateByHash.url,
            title: duplicateByHash.title,
            reason: 'identical_content',
            confidence: 1.0,
          },
        });
      }
    }

    // Use transaction for data consistency
    const result = await db.transaction(async (client) => {
      // Insert web page
      const pageResult = await client.query(
        `INSERT INTO web_pages (url, normalized_url, title, domain, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [url, url, title || 'Untitled', domain, JSON.stringify(metadata)]
      );

      const pageId = pageResult.rows[0].id;

      // Insert content if provided
      if (content) {
        await client.query(
          `INSERT INTO page_content (
            page_id, raw_content, cleaned_content, text_content,
            excerpt, word_count, reading_time_minutes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            pageId,
            content.raw || null,
            content.cleaned || null,
            content.text || null,
            content.excerpt || null,
            content.wordCount || 0,
            content.readingTime || 0,
          ]
        );
      }

      // Insert images
      if (images.length > 0) {
        const imageQuery = `
          INSERT INTO images (
            page_id, original_url, stored_filename, is_downloaded,
            file_size_bytes, mime_type, width, height, alt_text, caption
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;

        for (const image of images) {
          await client.query(imageQuery, [
            pageId,
            image.originalUrl,
            image.storedFilename || null,
            image.isDownloaded || false,
            image.fileSizeBytes || null,
            image.mimeType || null,
            image.width || null,
            image.height || null,
            image.altText || null,
            image.caption || null,
          ]);
        }
      }

      // Insert tags (OPTIONAL - don't fail if this has issues)
      if (tags && Array.isArray(tags) && tags.length > 0) {
        console.log(`📦 Processing ${tags.length} tags for page ${pageId}`);

        try {
          // Filter valid tags (non-empty strings, reasonable length)
          const validTags = tags.filter(tag =>
            tag && typeof tag === 'string' && tag.trim().length > 0 && tag.trim().length <= 100
          );

          // Deduplicate tags
          const uniqueTags = [...new Set(validTags.map(t => t.trim()))];

          console.log(`✅ After filtering: ${uniqueTags.length} unique tags`);

          // Insert each tag (limit to prevent slowdown)
          const MAX_TAGS = 20;
          let successCount = 0;

          for (let i = 0; i < Math.min(uniqueTags.length, MAX_TAGS); i++) {
            const tagName = uniqueTags[i];

            try {
              // Use client.query directly
              let tagResult;
              try {
                tagResult = await client.query('SELECT id FROM tags WHERE name = $1', [tagName]);
              } catch (e) {
                console.warn(`Failed to query tag "${tagName}":`, e.message);
                continue;
              }

              let tagId;
              if (tagResult.rows.length === 0) {
                // Create new tag
                try {
                  const insertResult = await client.query(
                    'INSERT INTO tags (name, usage_count) VALUES ($1, 1) RETURNING id',
                    [tagName]
                  );
                  tagId = insertResult.rows[0].id;
                  console.log(`  ✓ Created tag: "${tagName}"`);
                } catch (e) {
                  console.warn(`Failed to create tag:`, e.message);
                  continue;
                }
              } else {
                tagId = tagResult.rows[0].id;
                // Increment usage count (non-critical)
                try {
                  await client.query('UPDATE tags SET usage_count = usage_count + 1 WHERE id = $1', [tagId]);
                } catch (e) {
                  // Ignore
                }
              }

              // Add relationship
              try {
                await client.query(
                  `INSERT INTO page_tags (page_id, tag_id, is_ai_generated, confidence_score)
                   VALUES ($1, $2, $3, $4)
                   ON CONFLICT (page_id, tag_id) DO NOTHING`,
                  [pageId, tagId, false, null]
                );
                successCount++;
              } catch (e) {
                console.warn(`Failed to link tag:`, e.message);
              }

            } catch (error) {
              console.warn(`Failed to process tag "${tagName}":`, error.message);
            }
          }

          console.log(`✅ Successfully added ${successCount}/${Math.min(uniqueTags.length, MAX_TAGS)} tags`);
        } catch (error) {
          console.error('Error processing tags (non-critical):', error.message);
          // Don't fail the entire save if tags fail
        }
      }

      console.log(`ℹ️  Proceeding to save page ${pageId}`);

      // Insert links as relationships
      if (links.length > 0) {
        const linkQuery = `
          INSERT INTO page_relationships (source_page_id, target_page_id, relationship_type, metadata)
          VALUES ($1, NULL, 'link', $2)
        `;

        for (const link of links) {
          try {
            const linkUrl = new URL(link.url, url).href;
            await client.query(linkQuery, [pageId, JSON.stringify({ url: linkUrl, text: link.text })]);
          } catch (e) {
            // Skip invalid URLs
          }
        }
      }

      return { pageId };
    });

    // Process OCR synchronously (wait for completion before responding)
    let ocrResult = null;
    if (enableOCR && screenshot) {
      console.log('🤖 [BACKEND] Starting OCR + LLM analysis...');
      console.log(`🤖 [BACKEND] Screenshot length: ${screenshot.length}`);

      try {
        // Pass content and existing tags to OCR for better context
        const pageContent = content ? {
          text: content.text || content.text_content || null,
          excerpt: content.excerpt || null,
          wordCount: content.word_count || 0
        } : null;

        ocrResult = await processOCR(screenshot, url, title, pageContent, tags || []);

        if (ocrResult && ocrResult.success) {
          console.log('✅ [BACKEND] OCR + LLM analysis completed');
          console.log(`   - OCR text length: ${ocrResult.ocr_text?.length || 0}`);
          console.log(`   - Analysis:`, ocrResult.analysis);

          // Update metadata with OCR results
          const ocrMetadata = {
            ocr_processed: true,
            ocr_text: ocrResult.ocr_text,
            ocr_analysis: ocrResult.analysis
          };

          console.log('💾 [BACKEND] Updating web_pages metadata with OCR results...');

          await db.query(
            'UPDATE web_pages SET metadata = metadata || $1 WHERE id = $2',
            [JSON.stringify(ocrMetadata), result.pageId]
          );

          console.log('✅ [BACKEND] OCR metadata updated successfully');

          // Extract entity information from OCR analysis and add them
          if (ocrResult.analysis) {
            const analysis = ocrResult.analysis;

            // Build comprehensive tag list from all fields
            const extractedTags = [
              ...(analysis.tags || []),
              ...(analysis.categories || []),
              ...(analysis.keywords || []),
              // Actor/actress names
              ...(analysis.actors || []),
              ...(analysis.actress || []),
              ...(analysis.actors_male || []),
              ...(analysis.cast || []),
              // Other entity info
              ...(analysis.studio ? [analysis.studio] : []),
              ...(analysis.series ? [analysis.series] : []),
              ...(analysis.brand ? [analysis.brand] : []),
              ...(analysis.director ? [analysis.director] : []),
              ...(analysis.author ? [analysis.author] : []),
              // Product code if available
              ...(analysis.code ? [analysis.code] : [])
            ];

            // Filter out empty/duplicate tags
            const uniqueTags = [...new Set(extractedTags.filter(t => t && t.trim().length > 0))];

            if (uniqueTags.length > 0) {
              console.log(`📦 [BACKEND] Adding ${uniqueTags.length} entity-extracted tags:`, uniqueTags.slice(0, 20)); // Show first 20

              // Add tags synchronously
              for (const tagName of uniqueTags) {
                try {
                  await queries.addTagToPage(db, result.pageId, tagName, true, null);
                  console.log(`✅ [BACKEND] Tag added: ${tagName}`);
                } catch (err) {
                  console.error(`❌ [BACKEND] Failed to add entity tag "${tagName}":`, err.message);
                }
              }
            } else {
              console.log('ℹ️ [BACKEND] No entity tags found in OCR analysis');
            }

            // Log entity type and key fields
            console.log(`🎬 [BACKEND] Entity type: ${analysis.entity_type || 'unknown'}`);
            if (analysis.title) console.log(`   - Title: ${analysis.title}`);
            if (analysis.code) console.log(`   - Code: ${analysis.code}`);
            if (analysis.actors && analysis.actors.length > 0) {
              console.log(`   - Actors: ${analysis.actors.join(', ')}`);
            }
            if (analysis.actress && analysis.actress.length > 0) {
              console.log(`   - Actress: ${analysis.actress.join(', ')}`);
            }
          } else {
            console.log('ℹ️ [BACKEND] No OCR analysis found');
          }
        } else {
          console.warn('⚠️ [BACKEND] OCR processing returned no result or failed');
        }
      } catch (err) {
        console.error('❌ [BACKEND] OCR processing failed:', err);
        console.error('❌ [BACKEND] Error stack:', err.stack);
        // Don't fail the entire save if OCR fails
      }
    } else {
      console.log(`ℹ️ [BACKEND] OCR not enabled or no screenshot. enableOCR=${enableOCR}, hasScreenshot=${!!screenshot}`);
    }

    // Update response with OCR status
    res.json({
      success: true,
      action: 'created',
      pageId: result.pageId,
      tagsProcessed: tags.length || 0,
      ocrCompleted: !!ocrResult && ocrResult.success,
      ocrAnalysis: ocrResult?.analysis || null,
      message: enableOCR && screenshot
        ? (ocrResult && ocrResult.success
          ? `Page saved successfully with ${tags.length || 0} tags! OCR + LLM analysis completed.`
          : `Page saved successfully with ${tags.length || 0} tags! OCR analysis failed.`)
        : `Page saved successfully with ${tags.length || 0} tags`,
    });
  } catch (error) {
    console.error('Error saving page:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/pages/:id - Retrieve page
router.get('/:id', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const page = await queries.getPageById(db, req.params.id);

    if (!page) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }

    res.json({ success: true, page });
  } catch (error) {
    console.error('Error retrieving page:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/pages - List pages with pagination
router.get('/', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const { limit = 20, offset = 0, domain, startDate, endDate } = req.query;

    const pages = await queries.listPages(db, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      domain,
      startDate,
      endDate,
    });

    res.json({
      success: true,
      pages,
      count: pages.length,
    });
  } catch (error) {
    console.error('Error listing pages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/pages/:id - Delete page
router.delete('/:id', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const result = await queries.deletePage(db, req.params.id);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }

    res.json({ success: true, message: 'Page deleted successfully' });
  } catch (error) {
    console.error('Error deleting page:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/pages/:id/images - Get page images
router.get('/:id/images', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const images = await queries.getImagesByPageId(db, req.params.id);
    res.json({ success: true, images });
  } catch (error) {
    console.error('Error retrieving images:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/pages/:id/ai - Get AI analysis for page
router.get('/:id/ai', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const analysis = await queries.getAIAnalysisByPageId(db, req.params.id);
    res.json({ success: true, analysis });
  } catch (error) {
    console.error('Error retrieving AI analysis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/pages/:id/tags - Get page tags
router.get('/:id/tags', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const query = `
      SELECT t.* FROM tags t
      JOIN page_tags pt ON t.id = pt.tag_id
      WHERE pt.page_id = $1
      ORDER BY pt.is_ai_generated, t.name
    `;

    const result = await db.query(query, [req.params.id]);
    res.json({ success: true, tags: result.rows });
  } catch (error) {
    console.error('Error retrieving tags:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/pages/:id/tags - Add tag to page
router.post('/:id/tags', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const { tagName, isAIGenerated = false, confidenceScore } = req.body;

    if (!tagName) {
      return res.status(400).json({ success: false, error: 'Tag name is required' });
    }

    await queries.addTagToPage(db, req.params.id, tagName, isAIGenerated, confidenceScore);
    res.json({ success: true, message: 'Tag added successfully' });
  } catch (error) {
    console.error('Error adding tag:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/pages/:id/tags/:tagId - Remove tag from page
router.delete('/:id/tags/:tagId', async (req, res) => {
  const db = req.app.locals.db;

  try {
    await queries.removeTagFromPage(db, req.params.id, req.params.tagId);
    res.json({ success: true, message: 'Tag removed successfully' });
  } catch (error) {
    console.error('Error removing tag:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/pages/:id/relationships - Get page relationships
router.get('/:id/relationships', async (req, res) => {
  const db = req.app.locals.db;

  try {
    const relationships = await queries.getRelationshipsByPage(db, req.params.id);
    res.json({ success: true, relationships });
  } catch (error) {
    console.error('Error retrieving relationships:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
